import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { requireRole, AuthError } from '@/lib/rbac';
import { errorResponse } from '@/lib/api';
import { writeAuditLog, extractRequestMeta } from '@/lib/audit-log';
import { auditorCanViewChecklistContent, reviewWindowOpenForRole } from '@/lib/types';

// 觀察員意見編修(批42):僅作者本人可修正/刪除自己的練習意見;閘與新增對稱
// (配對+資料齊備後+觀察員審閱窗口內)。比照批29 委員意見編修哲學:寫了要能改。
async function loadOwnComment(cid: string, userId: string) {
  const c = await prisma.practiceComment.findUnique({
    where: { id: cid },
    include: {
      response: {
        select: {
          cycle: { select: { id: true, status: true, reviewWindowStart: true, reviewWindowEnd: true, observerWindowStart: true, observerWindowEnd: true } },
        },
      },
    },
  });
  if (!c) throw new AuthError(404, '意見不存在');
  if (c.observerId !== userId) throw new AuthError(403, '僅能編修自己的觀察員意見');
  const cycle = c.response.cycle;
  if (!auditorCanViewChecklistContent(cycle.status)) {
    throw new AuthError(403, '資料準備階段尚未開放審閱留言');
  }
  if (!reviewWindowOpenForRole('OBSERVER', cycle)) {
    throw new AuthError(403, '目前不在觀察員審閱時段內，暫不開放編修');
  }
  return c;
}

const Body = z.object({ content: z.string().trim().min(1).max(5000) });

export async function PATCH(req: Request, { params }: { params: { cid: string } }) {
  try {
    const user = await requireRole('OBSERVER');
    const body = Body.parse(await req.json());
    const c = await loadOwnComment(params.cid, user.id);

    const updated = await prisma.practiceComment.update({
      where: { id: c.id },
      data: { content: body.content },
    });

    await writeAuditLog({
      actorId: user.id,
      action: 'PRACTICE_COMMENT_UPDATE',
      entityType: 'PracticeComment',
      entityId: c.id,
      before: { content: c.content },
      after: { content: body.content },
      ...extractRequestMeta(req),
    });

    return NextResponse.json(updated);
  } catch (e) {
    return errorResponse(e);
  }
}

export async function DELETE(req: Request, { params }: { params: { cid: string } }) {
  try {
    const user = await requireRole('OBSERVER');
    const c = await loadOwnComment(params.cid, user.id);

    await prisma.practiceComment.delete({ where: { id: c.id } });

    await writeAuditLog({
      actorId: user.id,
      action: 'PRACTICE_COMMENT_DELETE',
      entityType: 'PracticeComment',
      entityId: c.id,
      before: { content: c.content },
      ...extractRequestMeta(req),
    });

    return NextResponse.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
