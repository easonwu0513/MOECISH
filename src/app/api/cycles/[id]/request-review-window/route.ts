import { NextResponse } from 'next/server';
import { assertCycleAccess } from '@/lib/rbac';
import { errorResponse } from '@/lib/api';
import { notifyReviewWindowRequested } from '@/lib/notify';
import { appBaseUrl } from '@/lib/baseUrl';
import { writeAuditLog, extractRequestMeta } from '@/lib/audit-log';

/**
 * 委員求援:審閱時段未設(委員全被鎖在門外且無自救)→ 一鍵通知中心設定審閱時段。
 * 僅受指派委員可提出(assertCycleAccess 對 AUDITOR 已限被指派且非 DRAFT);24h 去重於 notify 層。
 */
export async function POST(req: Request, { params }: { params: { id: string } }) {
  try {
    const { user, cycle } = await assertCycleAccess(params.id);
    if (user.role !== 'AUDITOR') {
      return NextResponse.json({ error: '僅稽核委員可提出此請求' }, { status: 403 });
    }

    const result = await notifyReviewWindowRequested({
      cycleId: cycle.id,
      auditorName: user.name,
      appBaseUrl: appBaseUrl(req),
    });

    await writeAuditLog({
      actorId: user.id,
      action: 'REVIEW_WINDOW_REQUEST',
      entityType: 'AuditCycle',
      entityId: cycle.id,
      after: { recipientCount: result.recipientCount },
      ...extractRequestMeta(req),
    });

    return NextResponse.json(result);
  } catch (e) {
    return errorResponse(e);
  }
}
