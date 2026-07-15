import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { requireRole } from '@/lib/rbac';
import { errorResponse } from '@/lib/api';
import { writeAuditLog, extractRequestMeta } from '@/lib/audit-log';
import { notifyTrackedReportSubmitted } from '@/lib/notify';
import { appBaseUrl } from '@/lib/baseUrl';
import { EXEC_STATUSES } from '@/lib/types';

const Body = z.object({
  content: z.string().trim().min(1, '請填寫進度說明').max(5000),
  execStatus: z.enum(EXEC_STATUSES),
});

/** 交易內偵測「已有待審回報 / 列管已結束」(並發雙送)的訊號:rollback 後轉 409。 */
class ReportConflictError extends Error {}

/**
 * 機關就某持續列管缺失提交一筆進度回報(批71)。
 *  - 僅該機關 ORG_ADMIN、列管項為「持續列管中(TRACKING)」時可送。
 *  - 有尚待審核(PENDING)的回報時擋重複送(一次一筆待審)。
 *  - 佐證由前端拿回傳 report.id 後另打 /api/evidences(targetType=TRACKED_REPORT)上傳。
 */
export async function POST(req: Request, { params }: { params: { id: string } }) {
  try {
    const user = await requireRole('ORG_ADMIN');
    const body = Body.parse(await req.json());

    const tracked = await prisma.trackedDeficiency.findUnique({
      where: { id: params.id },
      select: { id: true, organizationId: true, status: true },
    });
    if (!tracked) return NextResponse.json({ error: '列管項不存在' }, { status: 404 });
    if (tracked.organizationId !== user.organizationId) {
      return NextResponse.json({ error: '不可回報他機關的列管缺失' }, { status: 403 });
    }
    if (tracked.status !== 'TRACKING') {
      return NextResponse.json({ error: '此缺失已結束列管，無須再回報' }, { status: 400 });
    }

    // 交易內重查「無待審回報」+ 可序列化隔離(批73 專審 P2):防「檢查無 PENDING → create」空檔被另一
    // 並發送出(雙擊/重試)插入第二筆 PENDING,違反「一次一筆待審」不變量(schema 無部分唯一索引可擋)。
    let report: { id: string };
    try {
      report = await prisma.$transaction(async (tx) => {
        const fresh = await tx.trackedDeficiency.findUnique({
          where: { id: tracked.id },
          select: { status: true },
        });
        if (!fresh || fresh.status !== 'TRACKING') {
          throw new ReportConflictError('此缺失已結束列管，無須再回報');
        }
        const pending = await tx.trackedReport.findFirst({
          where: { trackedId: tracked.id, reviewStatus: 'PENDING' },
          select: { id: true },
        });
        if (pending) {
          throw new ReportConflictError('尚有一筆回報待審核，請待審核後再提交下一筆');
        }
        return tx.trackedReport.create({
          data: {
            trackedId: tracked.id,
            content: body.content,
            execStatus: body.execStatus,
            submittedById: user.id,
          },
          select: { id: true },
        });
      }, { isolationLevel: 'Serializable' });
    } catch (e) {
      if (e instanceof ReportConflictError) {
        return NextResponse.json({ error: e.message }, { status: 409 });
      }
      if ((e as { code?: string }).code === 'P2034') {
        return NextResponse.json({ error: '送出發生並發衝突，請稍候重試。' }, { status: 409 });
      }
      throw e;
    }

    await writeAuditLog({
      actorId: user.id,
      action: 'TRACKED_REPORT_SUBMIT',
      entityType: 'TrackedDeficiency',
      entityId: tracked.id,
      after: { reportId: report.id, execStatus: body.execStatus },
      ...extractRequestMeta(req),
    });

    try {
      await notifyTrackedReportSubmitted({ reportId: report.id, appBaseUrl: appBaseUrl(req) });
    } catch (e) {
      console.error('tracked report notify failed:', e);
    }

    return NextResponse.json({ report });
  } catch (e) {
    return errorResponse(e);
  }
}
