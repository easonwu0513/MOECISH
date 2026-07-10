import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { requireRole, AuthError } from '@/lib/rbac';
import { canAccess } from '@/lib/access-policy';
import { errorResponse } from '@/lib/api';
import { writeAuditLog, extractRequestMeta } from '@/lib/audit-log';

// 指導回饋編修(批30):僅作者(指導委員本人)可修正/刪除自己的回饋;結案後鎖定。
// (回饋為師徒溝通紀錄,無任何下游依賴——與批29 審閱筆記編修同哲學:寫了要能改。)
async function loadOwnFeedback(fbid: string, userId: string) {
  const fb = await prisma.practiceFeedback.findUnique({
    where: { id: fbid },
    include: { practiceFinding: { include: { cycle: { select: { status: true } } } } },
  });
  if (!fb) throw new AuthError(404, '回饋不存在');
  if (fb.mentorId !== userId) throw new AuthError(403, '僅能編修自己的回饋');
  // 階段閘與回饋 POST 對稱(專審 P2):practice.access 涵蓋 CLOSED 鎖定,
  // 亦擋「週期回退至 ONSITE 前」仍可改刪回饋的不對稱(原僅擋 CLOSED)
  if (!canAccess('practice.access', 'OBSERVER', fb.practiceFinding.cycle.status)) {
    throw new AuthError(409, '目前非練習開放階段，回饋已鎖定');
  }
  return fb;
}

const Body = z.object({ content: z.string().trim().min(1).max(5000) });

export async function PATCH(req: Request, { params }: { params: { fbid: string } }) {
  try {
    // 指導者可為稽核委員或中心人員(初期場次由中心帶審);作者本人閘於 loadOwnFeedback
    const user = await requireRole('AUDITOR', 'SUPER_ADMIN');
    const body = Body.parse(await req.json());
    const fb = await loadOwnFeedback(params.fbid, user.id);

    const updated = await prisma.practiceFeedback.update({
      where: { id: fb.id },
      data: { content: body.content },
      include: { mentor: { select: { id: true, name: true } } },
    });

    await writeAuditLog({
      actorId: user.id,
      action: 'PRACTICE_FEEDBACK_UPDATE',
      entityType: 'PracticeFeedback',
      entityId: fb.id,
      before: { content: fb.content },
      after: { content: body.content },
      ...extractRequestMeta(req),
    });

    return NextResponse.json(updated);
  } catch (e) {
    return errorResponse(e);
  }
}

export async function DELETE(req: Request, { params }: { params: { fbid: string } }) {
  try {
    const user = await requireRole('AUDITOR', 'SUPER_ADMIN');
    const fb = await loadOwnFeedback(params.fbid, user.id);

    await prisma.practiceFeedback.delete({ where: { id: fb.id } });

    await writeAuditLog({
      actorId: user.id,
      action: 'PRACTICE_FEEDBACK_DELETE',
      entityType: 'PracticeFeedback',
      entityId: fb.id,
      before: { content: fb.content },
      ...extractRequestMeta(req),
    });

    return NextResponse.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
