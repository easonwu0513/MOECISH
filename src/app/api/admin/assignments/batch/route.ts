import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { requireRole } from '@/lib/rbac';
import { errorResponse } from '@/lib/api';
import { writeAuditLog, extractRequestMeta } from '@/lib/audit-log';
import { canAssignAuditors } from '@/lib/stage';
import { hasFormerOrgAdminConflict } from '@/lib/coi';
import type { CycleStatus } from '@/lib/types';

const Body = z.object({
  auditorId: z.string().min(1),
  cycleIds: z.array(z.string().min(1)).min(1).max(200),
});

/**
 * 批次指派一位委員到多個週期(SUPER_ADMIN)。
 * 沿用迴避原則(委員不得審查自己服務機關)與冪等 upsert;回傳逐筆結果。
 */
export async function POST(req: Request) {
  try {
    const user = await requireRole('SUPER_ADMIN');
    const body = Body.parse(await req.json());

    // 迴避檢核需授權全集(批31 多重身分):與單筆 assignments POST 對齊,含 ORG_ADMIN 授權
    // (原批次路徑僅比對現用 organizationId,漏多重身分授權=批64 未掃到的兄弟 → 批74 補齊)。
    const auditor = await prisma.user.findUnique({
      where: { id: body.auditorId },
      include: { roleGrants: { where: { endedAt: null, role: 'ORG_ADMIN' } } },
    });
    if (!auditor || auditor.role !== 'AUDITOR' || !auditor.isActive) {
      return NextResponse.json({ error: '稽核委員不存在或已停用' }, { status: 400 });
    }
    // 委員「現任機關管理員」的機關集合(現用身分 organizationId ∪ 有效 ORG_ADMIN 授權)
    const orgAdminOrgIds = new Set<string>();
    if (auditor.organizationId) orgAdminOrgIds.add(auditor.organizationId);
    for (const g of auditor.roleGrants) if (g.organizationId) orgAdminOrgIds.add(g.organizationId);
    // 「曾任機關」迴避(選項2;預設停用→恆 false 零查詢)。同機關快取,避免批次逐週期重複查。
    const formerCache = new Map<string, boolean>();
    const formerConflict = async (orgId: string) => {
      if (!formerCache.has(orgId)) formerCache.set(orgId, await hasFormerOrgAdminConflict(auditor.id, orgId));
      return formerCache.get(orgId)!;
    };

    const cycles = await prisma.auditCycle.findMany({
      where: { id: { in: body.cycleIds } },
      select: { id: true, organizationId: true, status: true },
    });
    const cycleMap = new Map(cycles.map((c) => [c.id, c]));

    let assigned = 0;
    const skipped: { cycleId: string; reason: string }[] = [];
    await prisma.$transaction(async (tx) => {
      for (const cid of body.cycleIds) {
        const c = cycleMap.get(cid);
        if (!c) { skipped.push({ cycleId: cid, reason: '週期不存在' }); continue; }
        if (orgAdminOrgIds.has(c.organizationId)) {
          skipped.push({ cycleId: cid, reason: '迴避：委員服務於該機關（含多重身分所屬機關）' });
          continue;
        }
        if (await formerConflict(c.organizationId)) {
          skipped.push({ cycleId: cid, reason: '迴避：委員曾任該機關管理員（回溯期內）' });
          continue;
        }
        // 實地稽核結束後(缺失發布中起)委員名單凍結:不得再新增指派(與單筆 assignments POST 共用 canAssignAuditors)
        if (!canAssignAuditors(c.status as CycleStatus)) {
          skipped.push({ cycleId: cid, reason: '實地稽核已結束，名單已凍結' });
          continue;
        }
        const existing = await tx.auditorAssignment.findUnique({
          where: { cycleId_auditorId: { cycleId: cid, auditorId: auditor.id } },
        });
        if (existing) { skipped.push({ cycleId: cid, reason: '已指派' }); continue; }
        await tx.auditorAssignment.create({ data: { cycleId: cid, auditorId: auditor.id } });
        assigned++;
      }
    });

    await writeAuditLog({
      actorId: user.id,
      action: 'AUDITOR_BATCH_ASSIGN',
      entityType: 'User',
      entityId: auditor.id,
      after: { assigned, skipped: skipped.length },
      ...extractRequestMeta(req),
    });

    return NextResponse.json({ assigned, skipped });
  } catch (e) {
    return errorResponse(e);
  }
}
