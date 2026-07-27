import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { assertCycleAccess } from '@/lib/rbac';
import { errorResponse } from '@/lib/api';
import { writeAuditLog, extractRequestMeta } from '@/lib/audit-log';
import { notifyChecklistSubmitted } from '@/lib/notify';
import { checklistOrgCanEdit } from '@/lib/types';
import { appBaseUrl } from '@/lib/baseUrl';

/**
 * 機關完成檢核表填報送出:
 * - 僅 ORG_ADMIN(自家週期,assertCycleAccess 保證)
 * - 須全數作答才能送出(未答 → 400 帶數量)
 * - 送出後內容鎖定(填報 API 以 checklistSubmittedAt 擋寫),需委員退回才能再修改
 */
export async function POST(req: Request, { params }: { params: { id: string } }) {
  try {
    const { user, cycle } = await assertCycleAccess(params.id);
    if (user.role !== 'ORG_ADMIN') {
      return NextResponse.json({ error: '僅機關管理員可送出填報' }, { status: 403 });
    }
    if (cycle.checklistSubmittedAt) {
      return NextResponse.json({ error: '已送出，無需重複操作' }, { status: 409 });
    }
    if (!checklistOrgCanEdit(cycle.status)) {
      return NextResponse.json({ error: '目前週期狀態不開放填報送出（僅「資料準備中」可送出）' }, { status: 409 });
    }

    const [totalItems, answered] = await Promise.all([
      prisma.checklistItem.count({ where: { versionId: cycle.checklistVersionId } }),
      prisma.checklistResponse.count({
        where: { cycleId: cycle.id, compliance: { not: null } },
      }),
    ]);
    const unanswered = totalItems - answered;
    if (unanswered > 0) {
      return NextResponse.json(
        { error: `尚有 ${unanswered} 題未作答，請完成後再送出（沒有的項目請選「不適用」）` },
        { status: 400 },
      );
    }

    // P0 安全批:內容完成度閘——「部分符合/不符合」必有機關說明(規範內容/執行方式/執行結果),
    // 否則委員審閱時只有一枚選項無從判讀;缺者回列題號請補齊(比照 prep/submit 的缺項清單手法)。
    const pcNc = await prisma.checklistResponse.findMany({
      where: { cycleId: cycle.id, compliance: { in: ['PARTIALLY_COMPLIANT', 'NON_COMPLIANT'] } },
      select: { description: true, checklistItem: { select: { itemNo: true } } },
    });
    // trim 判空(對抗審查:純空白字串可繞過 SQL 的 null/'' 判定)
    const needDesc = pcNc.filter((r) => !r.description?.trim());
    if (needDesc.length > 0) {
      const nos = needDesc.map((r) => r.checklistItem.itemNo).slice(0, 20);
      return NextResponse.json(
        {
          error: `下列「部分符合／不符合」題目尚未填寫機關說明，請補齊後再送出：${nos.join('、')}${needDesc.length > 20 ? `…（共 ${needDesc.length} 題）` : ''}`,
        },
        { status: 400 },
      );
    }

    const submittedAt = new Date();
    await prisma.$transaction(async (tx) => {
      await tx.auditCycle.update({
        where: { id: cycle.id },
        data: {
          checklistSubmittedAt: submittedAt,
          checklistSubmittedBy: user.name,
          checklistReopenNote: null,
        },
      });
      // 送出(含退回後重新送出)即開啟新一輪審閱 → 重置委員「意見填寫完成」標記,避免中心看到上一輪殘留進度
      await tx.auditorAssignment.updateMany({
        where: { cycleId: cycle.id },
        data: { reviewDoneAt: null },
      });
    });

    await writeAuditLog({
      actorId: user.id,
      action: 'checklist.submit',
      entityType: 'AuditCycle',
      entityId: cycle.id,
      after: { submittedAt: submittedAt.toISOString(), totalItems },
      ...extractRequestMeta(req),
    });

    // 通知委員(失敗不擋流程)
    notifyChecklistSubmitted({
      cycleId: cycle.id,
      submittedByName: user.name,
      appBaseUrl: appBaseUrl(req),
    }).catch((e) => console.error('[checklist.submit] 通知失敗：', e));

    return NextResponse.json({ ok: true, submittedAt: submittedAt.toISOString() });
  } catch (e) {
    return errorResponse(e);
  }
}
