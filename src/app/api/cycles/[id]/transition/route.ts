import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { assertCycleAccess } from '@/lib/rbac';
import { errorResponse } from '@/lib/api';
import { canTransition, canRollback } from '@/lib/state-machine';
import type { CycleStatus, Role } from '@/lib/types';
import { writeAuditLog, extractRequestMeta } from '@/lib/audit-log';
import { ensureStandardPrepItems } from '@/lib/prep-standard';
import { auditorsFinalized } from '@/lib/audit-finalize';
import { notifyCycleStatusChange, notifyCommitteeReview } from '@/lib/notify';
import { cycleTransitionNotify } from '@/lib/notify-policy';
import { appBaseUrl } from '@/lib/baseUrl';

const Body = z.object({ target: z.string(), reason: z.string().optional() });

export async function POST(req: Request, { params }: { params: { id: string } }) {
  try {
    const { user, cycle } = await assertCycleAccess(params.id);
    const body = Body.parse(await req.json());
    const from = cycle.status as CycleStatus;
    const to = body.target as CycleStatus;

    const forward = canTransition(from, to, user.role as Role);
    const rollback = !forward && canRollback(from, to, user.role as Role);
    if (!forward && !rollback) {
      return NextResponse.json({ error: '不允許的狀態轉換' }, { status: 400 });
    }
    // 回退必須附理由(記入狀態轉換紀錄與稽核軌跡)
    if (rollback && (body.reason?.trim().length ?? 0) < 5) {
      return NextResponse.json({ error: '回退狀態必須填寫理由(至少 5 個字)' }, { status: 400 });
    }

    // 實地稽核 → 缺失發布(REPORT_ISSUED)前置:全體委員評分表須定稿。
    // 與「已完成年度稽核」(audit/finish)共用 auditorsFinalized,避免手動 transition 繞過定稿閘。
    if (to === 'REPORT_ISSUED' && forward) {
      const finalized = await auditorsFinalized(cycle.id);
      if (!finalized.ok) {
        return NextResponse.json({ error: finalized.error }, { status: 400 });
      }
    }

    // 缺失發布 → 矯正執行:至少要有一筆缺失(回退到 REMEDIATION 不受此限,缺失必然已存在)
    if (to === 'REMEDIATION' && forward) {
      const count = await prisma.deficiency.count({ where: { cycleId: cycle.id } });
      if (count === 0) {
        return NextResponse.json({ error: '尚未發布任何缺失，無法開放填報' }, { status: 400 });
      }
    }

    // 進入「資料齊備」(READY)前置:所有「必要」資料準備項須確認齊備,避免資料未齊就推進
    if (to === 'READY' && forward) {
      const reqs = await prisma.prepRequirement.findMany({
        where: { cycleId: cycle.id, required: true },
        include: { submission: { select: { status: true } } },
      });
      const notReady = reqs.filter((r) => r.submission?.status !== 'CONFIRMED');
      if (notReady.length > 0) {
        return NextResponse.json(
          { error: `尚有 ${notReady.length} 份必要資料未確認齊備,無法進入下一階段;請於「稽核前資料準備」逐項確認。` },
          { status: 400 },
        );
      }
    }

    // 結案前置條件:全數缺失審核通過 + 已上傳用印掃描檔
    if (to === 'CLOSED') {
      const notPassed = await prisma.deficiency.count({
        where: { cycleId: cycle.id, NOT: { action: { status: 'PASSED' } } },
      });
      if (notPassed > 0) {
        return NextResponse.json(
          { error: `尚有 ${notPassed} 項缺失未審核通過，無法結案` },
          { status: 400 },
        );
      }
      const signed = await prisma.signedReport.findFirst({
        where: { cycleId: cycle.id, confirmedAt: { not: null } },
      });
      if (!signed) {
        return NextResponse.json(
          { error: '請先上傳並確認用印掃描檔，再行結案' },
          { status: 400 },
        );
      }
    }

    const updated = await prisma.auditCycle.update({
      where: { id: cycle.id },
      data: {
        status: to,
        // 結案記時;自 CLOSED 回退(重啟)則清除結案時間
        closedAt: to === 'CLOSED' ? new Date() : from === 'CLOSED' ? null : undefined,
        stateTransitions: {
          create: { fromStatus: from, toStatus: to, actorId: user.id, reason: body.reason },
        },
      },
    });

    // 轉入「資料準備」時自動套用標準需求清單(冪等;中心仍可增刪),
    // 確保承辦端永遠有可上傳項目,避免空白頁卡關。失敗不影響狀態轉換本身。
    if (forward && to === 'PREPARATION') {
      try {
        await ensureStandardPrepItems(cycle.id, cycle.year);
      } catch (e) {
        console.error('[transition] 自動套用標準資料準備清單失敗:', (e as Error).message);
      }
    }

    // 推進週期狀態時通知機關承辦(forward 才通知;失敗不影響轉換本身)
    if (forward) {
      try {
        await notifyCycleStatusChange({ cycleId: cycle.id, status: to, appBaseUrl: appBaseUrl(req) });
      } catch (e) {
        console.error('[transition] 通知機關失敗:', (e as Error).message);
      }
    }

    // 進入「資料齊備」(READY)時,自動同時通知受指派委員開始審閱(站內通知 + email;
    // 不依賴中心手動點按,確保資料齊備即必然通知委員。dedupe 防重複,失敗不影響轉換本身)。
    // 通知時機由 notify-policy SoT 決定(committee=true 的狀態才通知;見 test:notify)。
    if (forward && cycleTransitionNotify(to).committee) {
      try {
        await notifyCommitteeReview({ cycleId: cycle.id, appBaseUrl: appBaseUrl(req) });
      } catch (e) {
        console.error('[transition] 通知委員審閱失敗:', (e as Error).message);
      }
    }

    const meta = extractRequestMeta(req);
    await writeAuditLog({
      actorId: user.id,
      action: rollback ? 'CYCLE_ROLLBACK' : 'CYCLE_TRANSITION',
      entityType: 'AuditCycle',
      entityId: cycle.id,
      before: { status: from },
      after: { status: to, ...(rollback ? { reason: body.reason } : {}) },
      ...meta,
    });

    return NextResponse.json({ status: updated.status });
  } catch (e) {
    return errorResponse(e);
  }
}
