import { NextResponse } from 'next/server';
import { requireRole } from '@/lib/rbac';
import { errorResponse } from '@/lib/api';
import { notifyCycleOpened } from '@/lib/notify';
import { appBaseUrl } from '@/lib/baseUrl';
import { writeAuditLog, extractRequestMeta } from '@/lib/audit-log';

/**
 * 中心「通知機關」按鈕:寄出「貴機關今年度將接受稽核 + 已確定時程」之作業通知。
 * 與 /notify(缺失已發布,僅 REPORT_ISSUED/REMEDIATION 顯示)不同;此供開立中 / 資料準備中使用。
 */
export async function POST(req: Request, { params }: { params: { id: string } }) {
  try {
    const user = await requireRole('SUPER_ADMIN');
    const result = await notifyCycleOpened({ cycleId: params.id, appBaseUrl: appBaseUrl(req) });

    await writeAuditLog({
      actorId: user.id,
      action: 'CYCLE_NOTIFY_OPENED',
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
