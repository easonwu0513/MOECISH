import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { requireUser, AuthError, assertAuditorScoreUnlocked } from '@/lib/rbac';
import { errorResponse } from '@/lib/api';
import { DEFICIENCY_ASPECTS, auditorCanScore } from '@/lib/types';
import { FINDING_KINDS } from '@/lib/audit-score';
import { writeAuditLog, extractRequestMeta } from '@/lib/audit-log';

/** 取出發現並驗證:本人(委員)或最高管理員;已轉缺失者鎖定。 */
async function loadAndGuard(fid: string) {
  const user = await requireUser();
  const finding = await prisma.auditFinding.findUnique({ where: { id: fid } });
  if (!finding) throw new AuthError(404, '找不到稽核發現');
  if (user.role !== 'SUPER_ADMIN' && finding.auditorId !== user.id) {
    throw new AuthError(403, '只能編輯自己的稽核發現');
  }
  if (finding.deficiencyId) {
    throw new AuthError(409, '此條已轉入缺失管考，鎖定不可再編輯');
  }
  // 委員本人已「確認填寫完畢」鎖定 → 擋下(SUPER 覆核不受限)
  if (user.role === 'AUDITOR') {
    await assertAuditorScoreUnlocked(finding.cycleId, user.id);
    // 階段閘下沉(與 findings/scores/lock 一致;R1 follow-up):委員僅於實地稽核(ONSITE 起)可改/刪發現,
    // 封「結案後仍可改歷史發現」與「非評分階段直打」的縫。SUPER 覆核不受此限。
    const cycle = await prisma.auditCycle.findUnique({ where: { id: finding.cycleId }, select: { status: true } });
    if (!cycle || !auditorCanScore(cycle.status)) {
      throw new AuthError(403, '目前非實地稽核階段，不可編輯稽核發現');
    }
  }
  return { user, finding };
}

const PatchBody = z.object({
  aspect: z.enum(DEFICIENCY_ASPECTS).optional(),
  kind: z.enum(FINDING_KINDS).optional(),
  content: z.string().trim().min(5).optional(),
  checklistRef: z.string().trim().nullable().optional(),
});

export async function PATCH(req: Request, { params }: { params: { fid: string } }) {
  try {
    const { user, finding } = await loadAndGuard(params.fid);
    const body = PatchBody.parse(await req.json());
    const updated = await prisma.auditFinding.update({
      where: { id: finding.id },
      data: {
        ...(body.aspect ? { aspect: body.aspect } : {}),
        ...(body.kind ? { kind: body.kind } : {}),
        ...(body.content ? { content: body.content } : {}),
        ...(body.checklistRef !== undefined ? { checklistRef: body.checklistRef || null } : {}),
      },
    });
    await writeAuditLog({
      actorId: user.id,
      action: 'audit.finding.update',
      entityType: 'AuditFinding',
      entityId: finding.id,
      before: finding,
      after: updated,
      ...extractRequestMeta(req),
    });
    return NextResponse.json(updated);
  } catch (e) {
    return errorResponse(e);
  }
}

export async function DELETE(req: Request, { params }: { params: { fid: string } }) {
  try {
    const { user, finding } = await loadAndGuard(params.fid);
    await prisma.auditFinding.delete({ where: { id: finding.id } });
    await writeAuditLog({
      actorId: user.id,
      action: 'audit.finding.delete',
      entityType: 'AuditFinding',
      entityId: finding.id,
      before: finding,
      ...extractRequestMeta(req),
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
