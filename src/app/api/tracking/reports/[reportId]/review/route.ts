import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { requireUser } from '@/lib/rbac';
import { errorResponse } from '@/lib/api';
import { writeAuditLog, extractRequestMeta } from '@/lib/audit-log';
import { notifyTrackedReviewed } from '@/lib/notify';
import { appBaseUrl } from '@/lib/baseUrl';
import { addMonths } from '@/lib/date';
import { TRACKED_REVIEW_DECISIONS } from '@/lib/types';

const Body = z.object({
  decision: z.enum(TRACKED_REVIEW_DECISIONS),
  note: z.string().trim().max(5000).optional(),
});

/** decision → 終態 reviewStatus。 */
const DECISION_TO_STATUS = { CONTINUE: 'CONTINUE', COMPLETE: 'COMPLETE', RETURN: 'RETURNED' } as const;

/**
 * 中心/協審委員審核一筆持續列管回報(批71):三態滾動審核。
 *  - CONTINUE(通過續列管):續追蹤,nextReportDue = now + cadence。
 *  - COMPLETE(認可完成):結束列管,tracked.status=COMPLETED + closedAt。
 *  - RETURN(退回補正,必填理由):機關可另建新回報重報。
 * 審核權=中心(SUPER_ADMIN)或該項被指派之協審委員(assignedAuditorId===user.id)。
 */
export async function POST(req: Request, { params }: { params: { reportId: string } }) {
  try {
    const user = await requireUser();
    const body = Body.parse(await req.json());
    if (body.decision === 'RETURN' && !body.note?.trim()) {
      return NextResponse.json({ error: '退回補正必須填寫理由' }, { status: 400 });
    }

    const report = await prisma.trackedReport.findUnique({
      where: { id: params.reportId },
      include: { tracked: { select: { id: true, status: true, assignedAuditorId: true, cadenceMonths: true } } },
    });
    if (!report) return NextResponse.json({ error: '回報不存在' }, { status: 404 });
    const tracked = report.tracked;

    // 雙授權:中心或被指派協審委員;其餘(含其他委員/機關/觀察員)一律拒絕
    const isAssignedAuditor = user.role === 'AUDITOR' && tracked.assignedAuditorId === user.id;
    if (user.role !== 'SUPER_ADMIN' && !isAssignedAuditor) {
      return NextResponse.json({ error: '僅中心或本項指派之協審委員可審核此回報' }, { status: 403 });
    }
    if (report.reviewStatus !== 'PENDING') {
      return NextResponse.json({ error: '此回報已審核' }, { status: 400 });
    }
    if (tracked.status !== 'TRACKING') {
      return NextResponse.json({ error: '此缺失已結束列管' }, { status: 400 });
    }

    const now = new Date();
    const newStatus = DECISION_TO_STATUS[body.decision];

    await prisma.$transaction(async (tx) => {
      await tx.trackedReport.update({
        where: { id: report.id },
        data: {
          reviewStatus: newStatus,
          reviewNote: body.note?.trim() || null,
          reviewedAt: now,
          reviewedById: user.id,
        },
      });
      if (body.decision === 'CONTINUE') {
        await tx.trackedDeficiency.update({
          where: { id: tracked.id },
          data: { nextReportDue: addMonths(now, tracked.cadenceMonths) },
        });
      } else if (body.decision === 'COMPLETE') {
        await tx.trackedDeficiency.update({
          where: { id: tracked.id },
          data: { status: 'COMPLETED', closedAt: now, closedById: user.id },
        });
      }
      // RETURN:列管項不動(機關另建新回報重報)
    });

    await writeAuditLog({
      actorId: user.id,
      action: 'TRACKED_REPORT_REVIEW',
      entityType: 'TrackedDeficiency',
      entityId: tracked.id,
      after: { reportId: report.id, decision: body.decision, status: newStatus },
      ...extractRequestMeta(req),
    });

    try {
      await notifyTrackedReviewed({ reportId: report.id, appBaseUrl: appBaseUrl(req) });
    } catch (e) {
      console.error('tracked review notify failed:', e);
    }

    return NextResponse.json({ ok: true, decision: body.decision });
  } catch (e) {
    return errorResponse(e);
  }
}
