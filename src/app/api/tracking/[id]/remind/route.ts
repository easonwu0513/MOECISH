import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireRole } from '@/lib/rbac';
import { errorResponse } from '@/lib/api';
import { writeAuditLog, extractRequestMeta } from '@/lib/audit-log';
import { notifyTrackedManualRemind } from '@/lib/notify';
import { appBaseUrl } from '@/lib/baseUrl';

/**
 * 手動催辦某持續列管項的機關回報(UAT 批H;僅中心)。
 * 系統本有每日 timer 自動催辦(D-7/逾期),此為中心於期限前後「加強催辦」的即時觸發;email + 站內,同項 24h 去重。
 */
export async function POST(req: Request, { params }: { params: { id: string } }) {
  try {
    const user = await requireRole('SUPER_ADMIN');
    const tracked = await prisma.trackedDeficiency.findUnique({
      where: { id: params.id },
      select: { id: true, status: true },
    });
    if (!tracked) return NextResponse.json({ error: '列管項不存在' }, { status: 404 });
    if (tracked.status !== 'TRACKING') {
      return NextResponse.json({ error: '此列管項已結案，無須催辦' }, { status: 400 });
    }

    let recipientCount = 0;
    let skipped = false;
    try {
      const r = await notifyTrackedManualRemind({ trackedId: tracked.id, appBaseUrl: appBaseUrl(req) });
      recipientCount = r.recipientCount;
      skipped = r.skipped;
    } catch (e) {
      console.error('tracked manual remind failed:', e);
    }

    await writeAuditLog({
      actorId: user.id,
      action: 'TRACKED_REMIND',
      entityType: 'TrackedDeficiency',
      entityId: tracked.id,
      after: { recipientCount, skipped },
      ...extractRequestMeta(req),
    });

    return NextResponse.json({ ok: true, recipientCount, skipped });
  } catch (e) {
    return errorResponse(e);
  }
}
