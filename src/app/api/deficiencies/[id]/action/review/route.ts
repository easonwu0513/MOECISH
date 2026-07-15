import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { assertDeficiencyAccess } from '@/lib/rbac';
import { errorResponse } from '@/lib/api';
import { REVIEW_DECISIONS, isUnfinishedExec, DEFAULT_TRACKING_CADENCE } from '@/lib/types';
import { isInvalidDeficiencyDescription } from '@/lib/convert-findings';
import { writeAuditLog, extractRequestMeta } from '@/lib/audit-log';
import { notifyOrgOnReturn, notifyOrgAllPassed, notifyTrackedCreated } from '@/lib/notify';
import { appBaseUrl } from '@/lib/baseUrl';
import { addMonths } from '@/lib/date';

const Body = z.object({
  decision: z.enum(REVIEW_DECISIONS),
  comment: z.string().optional(),
});

/** 稽核委員審查：通過（PASS）或退回補正（RETURN，必填理由，輪次 +1） */
export async function POST(req: Request, { params }: { params: { id: string } }) {
  try {
    const { user, deficiency } = await assertDeficiencyAccess(params.id);
    // 審核權限:本缺失指派的審閱委員 或 中心(SUPER_ADMIN);其餘委員(含未被指派審此缺失者)不可審。
    const isAssignedReviewer = user.role === 'AUDITOR' && deficiency.reviewerAuditorId === user.id;
    if (user.role !== 'SUPER_ADMIN' && !isAssignedReviewer) {
      return NextResponse.json({ error: '僅本缺失的指派審閱委員或中心可審查此缺失' }, { status: 403 });
    }
    const action = deficiency.action;
    if (!action) return NextResponse.json({ error: '矯正措施紀錄不存在' }, { status: 404 });
    if (action.status !== 'SUBMITTED') {
      return NextResponse.json({ error: '此項目目前不在送審狀態' }, { status: 400 });
    }

    const body = Body.parse(await req.json());
    if (body.decision === 'RETURN' && !body.comment?.trim()) {
      return NextResponse.json({ error: '退回補正必須填寫理由' }, { status: 400 });
    }
    // 縱深防禦(批48 圖6):缺失內容仍為佔位文字或空白者不可審核通過
    //(佔位缺失應由中心補述或退件;避免「沒寫任何實際內容」的缺失被通過結案)。
    if (body.decision === 'PASS' && isInvalidDeficiencyDescription(deficiency.description)) {
      return NextResponse.json(
        { error: '此缺失內容仍為佔位文字或空白，請中心先補述實際缺失內容後再審核通過。' },
        { status: 400 },
      );
    }

    // 快照本輪審查當下的填報內容(多輪比對用)
    const snapshot = JSON.stringify({
      rootCause: action.rootCause,
      measureStrategy: action.measureStrategy,
      measureManagement: action.measureManagement,
      measureTechnical: action.measureTechnical,
      plannedDate: action.plannedDate,
      trackingMethod: action.trackingMethod,
      execStatus: action.execStatus,
      actualDate: action.actualDate,
      extendedDate: action.extendedDate,
      delayReason: action.delayReason,
    });

    // 自動拋轉持續列管(批71):PASS 且執行情形為「辦理中」(未逾期/逾期)= 週期照常結案但事項未真正完成,
    // 於同一交易內冪等 upsert 至持續列管庫(deficiencyId @unique;重審不覆寫既有列管設定/期限)。
    const cycle = deficiency.cycle;
    const shouldTrack = body.decision === 'PASS' && isUnfinishedExec(action.execStatus);

    const updated = await prisma.$transaction(async (tx) => {
      await tx.reviewRecord.create({
        data: {
          actionId: action.id,
          round: action.round,
          decision: body.decision,
          comment: body.comment?.trim() || null,
          snapshot,
          auditorId: user.id,
        },
      });
      const up = await tx.correctiveAction.update({
        where: { id: action.id },
        data:
          body.decision === 'PASS'
            ? { status: 'PASSED' }
            : { status: 'RETURNED', round: { increment: 1 } },
      });
      if (shouldTrack) {
        await tx.trackedDeficiency.upsert({
          where: { deficiencyId: deficiency.id },
          create: {
            deficiencyId: deficiency.id,
            organizationId: cycle.organizationId,
            originCycleId: cycle.id,
            aspect: deficiency.aspect,
            type: deficiency.type,
            itemNo: deficiency.itemNo,
            description: deficiency.description,
            checklistRef: deficiency.checklistRef,
            originYear: cycle.year,
            cadenceMonths: DEFAULT_TRACKING_CADENCE,
            nextReportDue: addMonths(new Date(), DEFAULT_TRACKING_CADENCE),
          },
          update: {}, // 冪等:已列管則不動(避免重審重置列管期限/協審指派)
        });
      }
      return up;
    });

    const meta = extractRequestMeta(req);
    await writeAuditLog({
      actorId: user.id,
      action: body.decision === 'PASS' ? 'ACTION_PASS' : 'ACTION_RETURN',
      entityType: 'CorrectiveAction',
      entityId: action.id,
      before: { status: 'SUBMITTED', round: action.round },
      after: { status: updated.status, round: updated.round, tracked: shouldTrack },
      ...meta,
    });
    if (shouldTrack) {
      await writeAuditLog({
        actorId: user.id,
        action: 'TRACKED_CREATE',
        entityType: 'Deficiency',
        entityId: deficiency.id,
        after: { organizationId: cycle.organizationId, originYear: cycle.year, execStatus: action.execStatus },
        ...meta,
      });
    }

    // 通知機關(寄信失敗不影響審查結果)
    try {
      const base = appBaseUrl(req);
      if (body.decision === 'RETURN') {
        await notifyOrgOnReturn({
          deficiencyId: deficiency.id,
          comment: body.comment!.trim(),
          round: action.round,
          appBaseUrl: base,
        });
      } else {
        // 拋轉持續列管 → 通知機關「此缺失轉入持續列管,首次回報期限 X」
        if (shouldTrack) {
          await notifyTrackedCreated({ deficiencyId: deficiency.id, appBaseUrl: base });
        }
        // 通過後若全數通過 → 通知機關列印用印
        const notPassed = await prisma.deficiency.count({
          where: {
            cycleId: deficiency.cycleId,
            OR: [{ action: null }, { action: { status: { not: 'PASSED' } } }],
          },
        });
        if (notPassed === 0) {
          await notifyOrgAllPassed({ cycleId: deficiency.cycleId, appBaseUrl: base });
        }
      }
    } catch (e) {
      console.error('review notify failed:', e);
    }

    return NextResponse.json({ item: updated, tracked: shouldTrack });
  } catch (e) {
    return errorResponse(e);
  }
}
