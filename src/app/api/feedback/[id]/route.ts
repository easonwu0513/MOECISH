import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { requireRole } from '@/lib/rbac';
import { errorResponse } from '@/lib/api';
import { writeAuditLog, extractRequestMeta } from '@/lib/audit-log';

const Body = z.object({ status: z.enum(['OPEN', 'RESOLVED']) });

/** 問題回饋處理狀態切換(僅中心):RESOLVED 蓋處理時間與處理者快照;改回 OPEN 清除。 */
export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  try {
    const user = await requireRole('SUPER_ADMIN');
    const body = Body.parse(await req.json());

    const existing = await prisma.feedbackReport.findUnique({ where: { id: params.id }, select: { id: true } });
    if (!existing) return NextResponse.json({ error: '回饋不存在' }, { status: 404 });

    await prisma.feedbackReport.update({
      where: { id: params.id },
      data:
        body.status === 'RESOLVED'
          ? { status: 'RESOLVED', resolvedAt: new Date(), resolvedById: user.id }
          : { status: 'OPEN', resolvedAt: null, resolvedById: null },
    });

    await writeAuditLog({
      actorId: user.id,
      action: 'FEEDBACK_SET_STATUS',
      entityType: 'FeedbackReport',
      entityId: params.id,
      after: { status: body.status },
      ...extractRequestMeta(req),
    });

    return NextResponse.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
