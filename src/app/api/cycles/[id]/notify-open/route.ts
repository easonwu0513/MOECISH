import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireRole } from '@/lib/rbac';
import { errorResponse } from '@/lib/api';
import { notifyCycleOpened } from '@/lib/notify';
import { appBaseUrl } from '@/lib/baseUrl';
import { writeAuditLog, extractRequestMeta } from '@/lib/audit-log';

/**
 * 中心「通知機關」按鈕:寄出「貴機關今年度將接受稽核 + 已確定時程」之作業通知。
 * 與 /notify(缺失已發布,僅 REPORT_ISSUED/REMEDIATION 顯示)不同;此供開立中 / 資料準備中使用。
 * 時程未確定(尚未設實地稽核日)不開放寄送,避免寄出無時程通知擾民。
 */
export async function POST(req: Request, { params }: { params: { id: string } }) {
  try {
    const user = await requireRole('SUPER_ADMIN');
    const cycle = await prisma.auditCycle.findUnique({
      where: { id: params.id },
      select: { onsiteDate: true },
    });
    if (!cycle) return NextResponse.json({ error: '稽核週期不存在' }, { status: 404 });
    if (!cycle.onsiteDate) {
      return NextResponse.json(
        { error: '尚未設定實地稽核日,請先於「編輯日期」確定時程後再通知機關' },
        { status: 400 },
      );
    }
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
