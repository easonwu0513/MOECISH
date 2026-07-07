import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { requireRole, AuthError } from '@/lib/rbac';
import { errorResponse } from '@/lib/api';
import { DEFICIENCY_ASPECTS } from '@/lib/types';
import { canAccess } from '@/lib/access-policy';
import { FINDING_KINDS } from '@/lib/audit-score';
import { toFullWidthPunct } from '@/lib/fullwidth-punct';
import { writeAuditLog, extractRequestMeta } from '@/lib/audit-log';

// 練習發現單條編修(批30):僅「作者觀察員本人」可改/刪;階段閘同新增(ONSITE 起、結案鎖定)。
// 中心/指導委員為唯讀(回饋走 feedback 端點),機關完全不可見。
async function loadOwnPractice(pid: string, userId: string) {
  const pf = await prisma.practiceFinding.findUnique({
    where: { id: pid },
    include: { cycle: { select: { id: true, status: true } } },
  });
  if (!pf) throw new AuthError(404, '練習發現不存在');
  if (pf.observerId !== userId) throw new AuthError(403, '僅能編修自己的練習發現');
  if (!canAccess('practice.access', 'OBSERVER', pf.cycle.status)) {
    throw new AuthError(403, '練習於實地稽核階段開放(結案後鎖定)');
  }
  return pf;
}

const PatchBody = z.object({
  aspect: z.enum(DEFICIENCY_ASPECTS).optional(),
  kind: z.enum(FINDING_KINDS).optional(),
  content: z.string().trim().min(5, '練習內容至少 5 字').optional(),
  checklistRef: z.string().trim().max(50).nullable().optional(),
});

export async function PATCH(req: Request, { params }: { params: { pid: string } }) {
  try {
    const user = await requireRole('OBSERVER');
    const body = PatchBody.parse(await req.json());
    const pf = await loadOwnPractice(params.pid, user.id);

    const updated = await prisma.practiceFinding.update({
      where: { id: pf.id },
      data: {
        aspect: body.aspect ?? undefined,
        kind: body.kind ?? undefined,
        content: body.content !== undefined ? toFullWidthPunct(body.content) : undefined,
        checklistRef: body.checklistRef === undefined ? undefined : body.checklistRef || null,
      },
    });

    await writeAuditLog({
      actorId: user.id,
      action: 'PRACTICE_FINDING_UPDATE',
      entityType: 'PracticeFinding',
      entityId: updated.id,
      ...extractRequestMeta(req),
    });

    return NextResponse.json(updated);
  } catch (e) {
    return errorResponse(e);
  }
}

export async function DELETE(req: Request, { params }: { params: { pid: string } }) {
  try {
    const user = await requireRole('OBSERVER');
    const pf = await loadOwnPractice(params.pid, user.id);

    await prisma.practiceFinding.delete({ where: { id: pf.id } });

    await writeAuditLog({
      actorId: user.id,
      action: 'PRACTICE_FINDING_DELETE',
      entityType: 'PracticeFinding',
      entityId: pf.id,
      before: { content: pf.content, aspect: pf.aspect, kind: pf.kind },
      ...extractRequestMeta(req),
    });

    return NextResponse.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
