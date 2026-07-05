import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireRole } from '@/lib/rbac';
import { errorResponse } from '@/lib/api';
import { notifyCycleTrackReminder } from '@/lib/notify';
import { appBaseUrl } from '@/lib/baseUrl';
import { writeAuditLog, extractRequestMeta } from '@/lib/audit-log';

/**
 * 中心「一鍵寄追蹤信」:對落後(逾期/停滯)週期之機關管理員寄出進度追蹤提醒,並記錄催辦軌跡。
 * 僅最高管理員(中心)可用。DRAFT(尚未通知機關)與 CLOSED(已結案)不開放。
 */
export async function POST(_req: Request, { params }: { params: { id: string } }) {
  try {
    const user = await requireRole('SUPER_ADMIN');

    const cycle = await prisma.auditCycle.findUnique({
      where: { id: params.id },
      select: { id: true, status: true },
    });
    if (!cycle) return NextResponse.json({ error: '稽核週期不存在' }, { status: 404 });
    if (cycle.status === 'DRAFT') {
      return NextResponse.json(
        { error: '週期尚未正式通知機關,請先於週期頁「通知機關」後再催辦' },
        { status: 400 },
      );
    }
    if (cycle.status === 'CLOSED') {
      return NextResponse.json({ error: '週期已結案,無需催辦' }, { status: 400 });
    }

    const result = await notifyCycleTrackReminder({
      cycleId: cycle.id,
      triggeredById: user.id,
      appBaseUrl: appBaseUrl(_req),
    });

    if (result.recipientCount === 0) {
      return NextResponse.json({ error: '該機關沒有有效的機關管理員可通知' }, { status: 400 });
    }

    await writeAuditLog({
      actorId: user.id,
      action: 'CYCLE_TRACK_REMIND',
      entityType: 'AuditCycle',
      entityId: cycle.id,
      after: { recipientCount: result.recipientCount, remindCount: result.remindCount },
      ...extractRequestMeta(_req),
    });

    return NextResponse.json(result);
  } catch (e) {
    return errorResponse(e);
  }
}
