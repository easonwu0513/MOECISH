import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { assertDeficiencyAccess } from '@/lib/rbac';
import { errorResponse } from '@/lib/api';
import { actionEditable, CYCLE_STATUS_LABELS } from '@/lib/state-machine';
import type { ActionStatus, CycleStatus } from '@/lib/types';

/**
 * 缺失就地展開面板資料(批47):缺失列表點一筆就地展開矯正措施填報,免換頁。
 * 回傳「與詳情頁同權限/同語彙」的角色範圍資料,供 client DeficiencyRow 內嵌 ActionForm/ReviewPanel。
 * 授權完全沿用 assertDeficiencyAccess(ORG 限自家、AUDITOR 限被指派週期、OBSERVER default deny),
 * 另補委員「僅本人審閱」閘(與詳情頁 reviewerAuditorId 一致)。
 */
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  try {
    const { user, deficiency } = await assertDeficiencyAccess(params.id);
    // 委員僅能展開「指派給本人審閱」的缺失(與詳情頁一致;其餘不可見)
    if (user.role === 'AUDITOR' && deficiency.reviewerAuditorId !== user.id) {
      return NextResponse.json({ error: '您非此缺失的審閱委員' }, { status: 403 });
    }
    const cycle = deficiency.cycle;
    const action = deficiency.action;
    const status = (action?.status ?? 'PENDING') as ActionStatus;

    const isDefReviewer =
      user.role === 'SUPER_ADMIN' || (user.role === 'AUDITOR' && deficiency.reviewerAuditorId === user.id);
    const canFill = user.role === 'ORG_ADMIN' && cycle.status === 'REMEDIATION' && actionEditable(status);
    const canReview = isDefReviewer && status === 'SUBMITTED';
    const showAuditorNames = user.role === 'SUPER_ADMIN' || user.role === 'AUDITOR';

    const orgReadonlyReason =
      user.role === 'ORG_ADMIN' && !canFill && status !== 'PASSED'
        ? cycle.status !== 'REMEDIATION'
          ? `目前週期狀態為「${CYCLE_STATUS_LABELS[cycle.status as CycleStatus]}」,尚未開放矯正填報;待中心開放後即可編輯。`
          : status === 'SUBMITTED'
            ? '本項已送出審核,委員審查期間暫不可編輯;若被退回將重新開放。'
            : null
        : null;

    // 審閱委員姓名(僅中心/委員具名;機關端一律「審閱委員」)
    const reviewerName = new Map<string, string>();
    if (showAuditorNames) {
      const ids = Array.from(new Set((action?.reviews ?? []).map((r) => r.auditorId)));
      if (ids.length) {
        const us = await prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } });
        for (const u of us) reviewerName.set(u.id, u.name);
      }
    }

    const latestReturn = [...(action?.reviews ?? [])].reverse().find((r) => r.decision === 'RETURN');

    return NextResponse.json({
      type: deficiency.type,
      description: deficiency.description,
      checklistRef: deficiency.checklistRef,
      status,
      canFill,
      canReview,
      viewOnly: user.role === 'AUDITOR',
      orgReadonlyReason,
      round: action?.round ?? 1,
      latestReturnComment: status === 'RETURNED' ? (latestReturn?.comment ?? null) : null,
      action: action
        ? {
            id: action.id,
            status,
            round: action.round,
            rootCause: action.rootCause,
            measureStrategy: action.measureStrategy,
            measureManagement: action.measureManagement,
            measureTechnical: action.measureTechnical,
            plannedDate: action.plannedDate?.toISOString() ?? null,
            trackingMethod: action.trackingMethod,
            execStatus: action.execStatus,
            actualDate: action.actualDate?.toISOString() ?? null,
            extendedDate: action.extendedDate?.toISOString() ?? null,
            delayReason: action.delayReason,
            reviews: action.reviews.map((r) => ({
              id: r.id,
              round: r.round,
              decision: r.decision,
              comment: r.comment,
              snapshot: r.snapshot,
              decidedAt: r.decidedAt.toISOString(),
              auditorName: showAuditorNames ? (reviewerName.get(r.auditorId) ?? '稽核委員') : '審閱委員',
            })),
          }
        : null,
    });
  } catch (e) {
    return errorResponse(e);
  }
}
