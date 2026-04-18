import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireRole, AuthError } from '@/lib/rbac';
import { writeAuditLog, extractRequestMeta } from '@/lib/audit-log';

export async function POST(
  req: Request,
  { params }: { params: { id: string; commentId: string } },
) {
  try {
    const user = await requireRole('RESPONDENT', 'SUPERVISOR');

    const comment = await prisma.auditorComment.findUnique({
      where: { id: params.commentId },
      include: { response: { include: { cycle: true } } },
    });
    if (!comment || comment.responseId !== params.id) {
      return NextResponse.json({ error: 'comment 不存在' }, { status: 404 });
    }
    if (comment.response.cycle.organizationId !== user.organizationId) {
      return NextResponse.json({ error: 'forbidden' }, { status: 403 });
    }
    if (comment.resolvedAt) {
      return NextResponse.json({ error: '已經標記' }, { status: 400 });
    }

    const updated = await prisma.auditorComment.update({
      where: { id: comment.id },
      data: { resolvedAt: new Date(), resolvedById: user.id },
    });

    // If all comments in this cycle resolved → auto push back to IN_REVIEW
    const unresolved = await prisma.auditorComment.count({
      where: {
        response: { cycleId: comment.response.cycleId },
        resolvedAt: null,
      },
    });
    if (unresolved === 0 && comment.response.cycle.status === 'COMMENTS_RETURNED') {
      await prisma.auditCycle.update({
        where: { id: comment.response.cycleId },
        data: {
          status: 'IN_REVIEW',
          stateTransitions: {
            create: { fromStatus: 'COMMENTS_RETURNED', toStatus: 'IN_REVIEW', actorId: user.id },
          },
        },
      });
    }

    const meta = extractRequestMeta(req);
    await writeAuditLog({
      actorId: user.id,
      action: 'AUDITOR_COMMENT_RESOLVE',
      entityType: 'AuditorComment',
      entityId: updated.id,
      ...meta,
    });

    return NextResponse.json(updated);
  } catch (e) {
    if (e instanceof AuthError) return NextResponse.json({ error: e.message }, { status: e.status });
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}
