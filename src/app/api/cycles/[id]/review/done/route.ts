import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { assertCycleAccess } from '@/lib/rbac';
import { errorResponse } from '@/lib/api';
import { writeAuditLog, extractRequestMeta } from '@/lib/audit-log';
import { notifyChecklistReviewDone } from '@/lib/notify';
import { appBaseUrl } from '@/lib/baseUrl';

/**
 * 委員「檢核表意見填寫完成」:標記該委員已完成本週期檢核表審閱,通知中心彙整。
 * body { done?: boolean } — true(預設)標記完成;false 取消(可再補意見)。退回重填由中心決定。
 */
export async function POST(req: Request, { params }: { params: { id: string } }) {
  try {
    const { user, cycle } = await assertCycleAccess(params.id);
    if (user.role !== 'AUDITOR') {
      return NextResponse.json({ error: '僅稽核委員可標記意見填寫完成' }, { status: 403 });
    }
    const assignment = await prisma.auditorAssignment.findUnique({
      where: { cycleId_auditorId: { cycleId: cycle.id, auditorId: user.id } },
    });
    if (!assignment) {
      return NextResponse.json({ error: '您未被指派此週期' }, { status: 403 });
    }

    const body = await req.json().catch(() => ({}));
    const done = body.done !== false;
    if (done && !cycle.checklistSubmittedAt) {
      return NextResponse.json({ error: '機關尚未送出填報，無可審閱' }, { status: 409 });
    }

    await prisma.auditorAssignment.update({
      where: { cycleId_auditorId: { cycleId: cycle.id, auditorId: user.id } },
      data: { reviewDoneAt: done ? new Date() : null },
    });

    await writeAuditLog({
      actorId: user.id,
      action: 'CHECKLIST_REVIEW_DONE',
      entityType: 'AuditCycle',
      entityId: cycle.id,
      after: { done },
      ...extractRequestMeta(req),
    });

    if (done) {
      notifyChecklistReviewDone({ cycleId: cycle.id, auditorName: user.name, appBaseUrl: appBaseUrl(req) })
        .catch((e) => console.error('[review.done] 通知失敗：', e));
    }

    return NextResponse.json({ ok: true, done });
  } catch (e) {
    return errorResponse(e);
  }
}
