import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { requireRole, AuthError } from '@/lib/rbac';
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
  if (fb.practiceFinding.cycle.status === 'CLOSED') {
    throw new AuthError(409, '週期已結案,回饋已鎖定');
  }
  return fb;
}

const Body = z.object({ content: z.string().trim().min(1).max(5000) });

export async function PATCH(req: Request, { params }: { params: { fbid: string } }) {
  try {
    const user = await requireRole('AUDITOR');
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
    const user = await requireRole('AUDITOR');
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
