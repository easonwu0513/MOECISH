import { NextResponse } from 'next/server';
import { requireRole } from '@/lib/rbac';
import { errorResponse } from '@/lib/api';
import { notifyCommitteeReview } from '@/lib/notify';
import { appBaseUrl } from '@/lib/baseUrl';
import { writeAuditLog, extractRequestMeta } from '@/lib/audit-log';

/**
 * 中心於「資料齊備」後,寄信通知受指派委員開始審閱檢核表(由週期推進至資料齊備時的提示觸發)。
 */
export async function POST(req: Request, { params }: { params: { id: string } }) {
  try {
    const user = await requireRole('SUPER_ADMIN');
    const result = await notifyCommitteeReview({ cycleId: params.id, appBaseUrl: appBaseUrl(req) });

    await writeAuditLog({
      actorId: user.id,
      action: 'CYCLE_NOTIFY_COMMITTEE_REVIEW',
      entityType: 'AuditCycle',
      entityId: params.id,
      after: result,
      ...extractRequestMeta(req),
    });

    return NextResponse.json(result);
  } catch (e) {
    return errorResponse(e);
  }
}
