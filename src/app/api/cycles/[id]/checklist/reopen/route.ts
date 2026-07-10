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
 * 退回原因「選填」(留空用系統預設說明);會寄給機關並顯示於填報頁 —— 機關看不到委員逐題意見,故補正方向須由此退回原因載明。
 */
export async function POST(req: Request, { params }: { params: { id: string } }) {
  try {
    const { user, cycle } = await assertCycleAccess(params.id);
    if (user.role !== 'SUPER_ADMIN') {
      return NextResponse.json({ error: '僅最高管理員可退回重填（委員請逐題留意見並按「意見填寫完成」）' }, { status: 403 });
    }
    if (!cycle.checklistSubmittedAt) {
      return NextResponse.json({ error: '機關尚未送出填報，無可退回' }, { status: 409 });
    }
    // 階段閘(全掃 P1):機關僅能於「資料準備中(PREPARATION)」重編/重送檢核表(checklistOrgCanEdit)。
    // 若週期已推進離開該階段就退回,會清掉 checklistSubmittedAt 但機關無編輯權=死路(文案叫補正卻鎖死),
    // 且破壞 READY 推進閘依賴的不變式。此階段之後要改檢核表,中心須先回退週期至 PREPARATION。
    if (cycle.status !== 'PREPARATION') {
      return NextResponse.json({ error: '週期已離開「資料準備中」，機關無法重新編輯檢核表；如需退回請先回退週期階段至「資料準備中」。' }, { status: 409 });
    }

    const body = await req.json().catch(() => ({}));
    const reason = String(body.reason ?? '').trim();
    // 原因選填:留空時用中性預設句(機關看不到委員意見,故不指涉「委員意見」),DB 與通知信一致
    const note = reason || '請就檢核表填報內容重新檢視、補正後重新送出。';

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
    }).catch((e) => console.error('[checklist.reopen] 通知失敗：', e));

    return NextResponse.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
