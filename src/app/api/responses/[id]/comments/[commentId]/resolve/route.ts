import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireRole } from '@/lib/rbac';
import { writeAuditLog, extractRequestMeta } from '@/lib/audit-log';
import { errorResponse } from '@/lib/api';

export async function POST(
  req: Request,
  { params }: { params: { id: string; commentId: string } },
) {
  try {
    const user = await requireRole('ORG_ADMIN');

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

    // 2.0:檢核表為選用模組,補正完成不再驅動週期狀態轉換

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
    return errorResponse(e);
  }
}
