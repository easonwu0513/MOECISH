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
import { notifyCycleStatusChange, notifyCommitteeReview, notifyObserversOnReviewOpen } from '@/lib/notify';
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
      return NextResponse.json({ error: '回退狀態必須填寫理由（至少 5 個字）' }, { status: 400 });
    }

    // 推進至「資料準備(PREPARATION)」或「資料齊備(READY)」前置(批67 P1):週期四個關鍵日期須先設定
    // (技術檢測日/實地稽核日/技術檢測資料截止/實地稽核資料截止),否則機關無繳交依據、委員無時程可循。
    // 矯正填報截止(dueDate)不在此閘(於進入 REMEDIATION 時另閘);rollback 不受此限。
    if (forward && (to === 'PREPARATION' || to === 'READY')) {
      const missing: string[] = [];
      if (!cycle.techCheckDate) missing.push('技術檢測日');
      if (!cycle.onsiteDate) missing.push('實地稽核日');
      if (!cycle.prepDueTech) missing.push('技術檢測資料繳交截止');
      if (!cycle.prepDueDate) missing.push('實地稽核資料繳交截止');
      if (missing.length > 0) {
        return NextResponse.json(
          { error: `尚未設定週期日期：${missing.join('、')}；請先於進階設定「編輯日期」設定後再推進。` },
          { status: 400 },
        );
      }
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
      // 矯正截止日須先設定(機關依此填報;與 audit/finish 一致的閘,兩路徑不被繞過;批48 圖8)
      if (!cycle.dueDate) {
        return NextResponse.json(
          { error: '尚未設定矯正截止日，無法進入矯正執行；請先於週期首頁「編輯日期」設定矯正截止日。' },
          { status: 400 },
        );
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
          { error: `尚有 ${notReady.length} 份必要資料未確認齊備，無法進入下一階段；請於「稽核前資料準備」逐項確認。` },
          { status: 400 },
        );
      }
      // 檢核表也須完成送出:「資料齊備」即開放委員審閱檢核表,未送出=委員無資料可審。
      // (原僅檢查資料準備項 → 附件 20/20 但檢核表未填也能推進,UAT 批61 圖3 補上)
      if (!cycle.checklistSubmittedAt) {
        return NextResponse.json(
          { error: '機關尚未完成並送出「資通安全檢核表」，無法進入資料齊備；請待機關完成填報送出後再推進。' },
          { status: 400 },
        );
      }
      // 委員審閱時段須先設定:「資料齊備」階段即通知委員可審閱機關資料;若未設審閱起訖,委員收到通知
      // 點進系統卻顯示「尚未開放審閱」(名實不符)。故強制中心於推進前先設定審閱時段。(UAT 圖2)
      if (!cycle.reviewWindowStart || !cycle.reviewWindowEnd) {
        return NextResponse.json(
          {
            error:
              '尚未設定「委員審閱時段」，無法進入資料齊備（此階段即開放委員審閱）。請先於「稽核前資料準備」頁設定審閱起訖日期後再推進。',
          },
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

    // 悲觀鎖 aggregate root(FOR UPDATE)+ 樂觀鎖(status===from):先鎖住本週期列,使 REPORT_ISSUED 定稿重驗與
    // 狀態落地期間,委員不可能並發解鎖(audit/lock)或被退件(audit/return)——二者對稱鎖同列、且於 REPORT_ISSUED 起
    // 本就被凍結閘擋,故消除「讀定稿(全體已定稿)後、狀態 commit 前被解鎖」的 TOCTOU。⚠️不可只靠 Serializable:對手方
    // 解鎖為非交易裸 UPDATE(READ COMMITTED),PostgreSQL SSI 不追蹤、無法形成 rw 依賴環。status===from 另擋並發
    // 同向推進(重複 notify / 標準清單 seed 重入 / 幻影轉換列);敗者 count===0 → 409。
    const won = await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "AuditCycle" WHERE id = ${cycle.id} FOR UPDATE`;
      if (to === 'REPORT_ISSUED' && forward) {
        const f = await auditorsFinalized(cycle.id, tx); // 持列鎖下重驗:期間不可能有並發解鎖/退件
        if (!f.ok) return false; // 定稿已不成立 → 視為競態,回 409 重試(前置閘已給清楚訊息)
      }
      const res = await tx.auditCycle.updateMany({
        where: { id: cycle.id, status: from },
        data: {
          status: to,
          // 結案記時;自 CLOSED 回退(重啟)則清除結案時間
          closedAt: to === 'CLOSED' ? new Date() : from === 'CLOSED' ? null : undefined,
        },
      });
      if (res.count === 0) return false;
      await tx.cycleStateTransition.create({
        data: { cycleId: cycle.id, fromStatus: from, toStatus: to, actorId: user.id, reason: body.reason ?? null },
      });
      return true;
      // 提高 timeout(預設 5s):此交易持 AuditCycle 列鎖,可能排隊等 finish 的長臨界區(逐筆轉缺失),防等鎖期間 P2028。
    }, { timeout: 30000, maxWait: 10000 });
    if (!won) {
      return NextResponse.json({ error: '週期狀態已被其他操作變更，請重新整理後再試。' }, { status: 409 });
    }

    // 轉入「資料準備」時自動套用標準需求清單(冪等;中心仍可增刪),
    // 確保承辦端永遠有可上傳項目,避免空白頁卡關。失敗不影響狀態轉換本身。
    if (forward && to === 'PREPARATION') {
      try {
        await ensureStandardPrepItems(cycle.id, cycle.year);
      } catch (e) {
        console.error('[transition] 自動套用標準資料準備清單失敗：', (e as Error).message);
      }
    }

    // 推進週期狀態時通知機關承辦(forward 才通知;失敗不影響轉換本身)
    if (forward) {
      try {
        await notifyCycleStatusChange({ cycleId: cycle.id, status: to, appBaseUrl: appBaseUrl(req) });
      } catch (e) {
        console.error('[transition] 通知機關失敗：', (e as Error).message);
      }
    }

    // 進入「資料齊備」(READY)時,自動同時通知受指派委員開始審閱(站內通知 + email;
    // 不依賴中心手動點按,確保資料齊備即必然通知委員。dedupe 防重複,失敗不影響轉換本身)。
    // 通知時機由 notify-policy SoT 決定(committee=true 的狀態才通知;見 test:notify)。
    if (forward && cycleTransitionNotify(to).committee) {
      try {
        await notifyCommitteeReview({ cycleId: cycle.id, appBaseUrl: appBaseUrl(req) });
      } catch (e) {
        console.error('[transition] 通知委員審閱失敗：', (e as Error).message);
      }
    }

    // 進入「資料齊備」時,一併通知本週期「已配對」觀察員可於觀察員審閱時段檢視機關資料(師徒制;email + 站內)。
    // 時機由 notify-policy SoT 決定(observer=true 的狀態);僅通知本週期配對觀察員,失敗不影響轉換本身。
    if (forward && cycleTransitionNotify(to).observer) {
      try {
        await notifyObserversOnReviewOpen({ cycleId: cycle.id, appBaseUrl: appBaseUrl(req) });
      } catch (e) {
        console.error('[transition] 通知觀察員審閱失敗：', (e as Error).message);
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

    return NextResponse.json({ status: to });
  } catch (e) {
    return errorResponse(e);
  }
}
