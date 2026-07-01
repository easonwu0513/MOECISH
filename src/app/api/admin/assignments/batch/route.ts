import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { requireRole } from '@/lib/rbac';
import { errorResponse } from '@/lib/api';
import { writeAuditLog, extractRequestMeta } from '@/lib/audit-log';
import { canAssignAuditors } from '@/lib/stage';
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

    const auditor = await prisma.user.findUnique({ where: { id: body.auditorId } });
    if (!auditor || auditor.role !== 'AUDITOR' || !auditor.isActive) {
      return NextResponse.json({ error: '稽核委員不存在或已停用' }, { status: 400 });
    }

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
        if (auditor.organizationId && auditor.organizationId === c.organizationId) {
          skipped.push({ cycleId: cid, reason: '迴避:委員服務於該機關' });
          continue;
        }
        // 實地稽核結束後(缺失發布中起)委員名單凍結:不得再新增指派(與單筆 assignments POST 共用 canAssignAuditors)
        if (!canAssignAuditors(c.status as CycleStatus)) {
          skipped.push({ cycleId: cid, reason: '實地稽核已結束,名單已凍結' });
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
