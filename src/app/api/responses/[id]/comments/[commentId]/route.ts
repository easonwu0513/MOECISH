import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { requireRole } from '@/lib/rbac';
import { writeAuditLog, extractRequestMeta } from '@/lib/audit-log';
import { errorResponse } from '@/lib/api';
import { auditorCanViewChecklistContent, auditorReviewWindowOpen } from '@/lib/types';

const Body = z.object({ content: z.string().min(1) });

// 委員審閱筆記為「委員本人的留存筆記」,新增後仍需可修正/刪除(UAT)。
// 僅作者本人可操作;閘門與新增留言一致(指派、資料齊備、審閱窗口)。機關一旦已回應
// ——不論是標記已補正(resolvedAt)或填寫補正回應(orgRevisionNote)——即不再開放修改/
// 刪除,以免機關補正回應變成孤兒(orgRevisionNote 以「本題有委員意見」為前提,刪光最後一則
// 委員意見會使該回應失去對象,且機關之後也無法再經 /revision 清除,故一併擋下)。
async function loadOwnEditableComment(
  responseId: string,
  commentId: string,
  userId: string,
  userRole: string,
) {
  const comment = await prisma.auditorComment.findUnique({
    where: { id: commentId },
    include: { response: { include: { cycle: { include: { assignments: true } } } } },
  });
  if (!comment || comment.responseId !== responseId) {
    return { error: NextResponse.json({ error: 'comment 不存在' }, { status: 404 }) };
  }
  if (comment.auditorId !== userId) {
    return { error: NextResponse.json({ error: '僅能修改自己的審閱筆記' }, { status: 403 }) };
  }
  if (comment.resolvedAt || comment.response.orgRevisionNote) {
    return { error: NextResponse.json({ error: '機關已回應此筆記，不可再修改或刪除' }, { status: 409 }) };
  }
  // 委員身分需通過與新增留言相同的三道閘(中心/最高管理員不受此限,與 POST 一致)
  if (userRole === 'AUDITOR') {
    const cycle = comment.response.cycle;
    if (!cycle.assignments.some((a) => a.auditorId === userId)) {
      return { error: NextResponse.json({ error: '您未被指派此稽核週期' }, { status: 403 }) };
    }
    if (!auditorCanViewChecklistContent(cycle.status)) {
      return { error: NextResponse.json({ error: '資料準備階段尚未開放委員審閱' }, { status: 403 }) };
    }
    if (!auditorReviewWindowOpen(cycle.reviewWindowStart, cycle.reviewWindowEnd)) {
      return { error: NextResponse.json({ error: '目前不在委員審閱時間區間內，暫不開放審閱' }, { status: 403 }) };
    }
  }
  return { comment };
}

/** 委員修正自己的審閱筆記(圖5:新增後仍可修正)。 */
export async function PATCH(
  req: Request,
  { params }: { params: { id: string; commentId: string } },
) {
  try {
    const user = await requireRole('AUDITOR', 'SUPER_ADMIN');
    const body = Body.parse(await req.json());

    const loaded = await loadOwnEditableComment(params.id, params.commentId, user.id, user.role);
    if (loaded.error) return loaded.error;
    const { comment } = loaded;

    const updated = await prisma.auditorComment.update({
      where: { id: comment.id },
      data: { content: body.content },
    });

    await writeAuditLog({
      actorId: user.id,
      action: 'AUDITOR_COMMENT_UPDATE',
      entityType: 'AuditorComment',
      entityId: updated.id,
      before: { content: comment.content },
      after: { content: updated.content },
      ...extractRequestMeta(req),
    });

    return NextResponse.json(updated);
  } catch (e) {
    return errorResponse(e);
  }
}

/** 委員刪除自己的審閱筆記(圖5:刪掉)。 */
export async function DELETE(
  req: Request,
  { params }: { params: { id: string; commentId: string } },
) {
  try {
    const user = await requireRole('AUDITOR', 'SUPER_ADMIN');

    const loaded = await loadOwnEditableComment(params.id, params.commentId, user.id, user.role);
    if (loaded.error) return loaded.error;
    const { comment } = loaded;

    await prisma.auditorComment.delete({ where: { id: comment.id } });

    await writeAuditLog({
      actorId: user.id,
      action: 'AUDITOR_COMMENT_DELETE',
      entityType: 'AuditorComment',
      entityId: comment.id,
      before: { content: comment.content, round: comment.round },
      ...extractRequestMeta(req),
    });

    return NextResponse.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
