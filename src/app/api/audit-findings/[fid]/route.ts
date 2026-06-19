import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { requireUser, AuthError } from '@/lib/rbac';
import { errorResponse } from '@/lib/api';
import { DEFICIENCY_ASPECTS } from '@/lib/types';
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
    throw new AuthError(409, '此條已轉入缺失管考,鎖定不可再編輯');
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
