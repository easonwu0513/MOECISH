import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { assertCycleAccess } from '@/lib/rbac';
import { errorResponse } from '@/lib/api';
import { writeAuditLog, extractRequestMeta } from '@/lib/audit-log';
import { notifyChecklistReopened } from '@/lib/notify';
import { appBaseUrl } from '@/lib/baseUrl';

/**
 * 退回檢核表重填:由最高管理員(中心)操作。
 * 委員逐題留意見後按「意見填寫完成」通知中心;中心彙整後決定是否退回。
 * 退回原因「選填」(委員逐題意見即為理由);填了會寄給機關並顯示於填報頁。
 */
export async function POST(req: Request, { params }: { params: { id: string } }) {
  try {
    const { user, cycle } = await assertCycleAccess(params.id);
    if (user.role !== 'SUPER_ADMIN') {
      return NextResponse.json({ error: '僅最高管理員可退回重填(委員請逐題留意見並按「意見填寫完成」)' }, { status: 403 });
    }
    if (!cycle.checklistSubmittedAt) {
      return NextResponse.json({ error: '機關尚未送出填報,無可退回' }, { status: 409 });
    }

    const body = await req.json().catch(() => ({}));
    const reason = String(body.reason ?? '').trim();
    // 原因選填:留空時用預設句,DB 與通知信一致(避免信中出現空白「退回原因:」)
    const note = reason || '請依各題委員意見補正後重新送出。';

    await prisma.auditCycle.update({
      where: { id: cycle.id },
      data: {
        checklistSubmittedAt: null,
        checklistSubmittedBy: null,
        checklistReopenNote: note,
      },
    });

    await writeAuditLog({
      actorId: user.id,
      action: 'checklist.reopen',
      entityType: 'AuditCycle',
      entityId: cycle.id,
      before: { submittedAt: cycle.checklistSubmittedAt },
      after: { reason: note },
      ...extractRequestMeta(req),
    });

    notifyChecklistReopened({
      cycleId: cycle.id,
      reason: note,
      reopenedByName: user.name,
      appBaseUrl: appBaseUrl(req),
    }).catch((e) => console.error('[checklist.reopen] 通知失敗:', e));

    return NextResponse.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
