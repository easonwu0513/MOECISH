import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { assertCycleAccess } from '@/lib/rbac';
import { errorResponse } from '@/lib/api';
import { writeAuditLog, extractRequestMeta } from '@/lib/audit-log';
import { notifyChecklistReopened } from '@/lib/notify';
import { appBaseUrl } from '@/lib/baseUrl';

/**
 * 退回檢核表重填:
 * - 受指派委員或最高管理員(assertCycleAccess 已擋未指派委員)
 * - 必填退回原因,會寄給機關管理員並顯示在填報頁
 */
export async function POST(req: Request, { params }: { params: { id: string } }) {
  try {
    const { user, cycle } = await assertCycleAccess(params.id);
    if (user.role !== 'AUDITOR' && user.role !== 'SUPER_ADMIN') {
      return NextResponse.json({ error: '僅稽核委員或管理員可退回' }, { status: 403 });
    }
    if (!cycle.checklistSubmittedAt) {
      return NextResponse.json({ error: '機關尚未送出填報,無可退回' }, { status: 409 });
    }

    const body = await req.json().catch(() => ({}));
    const reason = String(body.reason ?? '').trim();
    if (!reason) {
      return NextResponse.json({ error: '請填寫退回原因(機關會收到此說明)' }, { status: 400 });
    }

    await prisma.auditCycle.update({
      where: { id: cycle.id },
      data: {
        checklistSubmittedAt: null,
        checklistSubmittedBy: null,
        checklistReopenNote: reason,
      },
    });

    await writeAuditLog({
      actorId: user.id,
      action: 'checklist.reopen',
      entityType: 'AuditCycle',
      entityId: cycle.id,
      before: { submittedAt: cycle.checklistSubmittedAt },
      after: { reason },
      ...extractRequestMeta(req),
    });

    notifyChecklistReopened({
      cycleId: cycle.id,
      reason,
      reopenedByName: user.name,
      appBaseUrl: appBaseUrl(req),
    }).catch((e) => console.error('[checklist.reopen] 通知失敗:', e));

    return NextResponse.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
