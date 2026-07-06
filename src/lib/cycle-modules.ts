import { canAccess } from './access-policy';
import {
  auditorCanViewChecklistContent,
  auditorCanScore,
  onsiteStageEnded,
  type CycleStatus,
  type Role,
} from './types';

/**
 * 週期四大工作模組的「導覽+狀態」單一來源(減法批:dup#6/roles#7)。
 * 之前週期頁模組磚(page.tsx)與資料準備左欄(prep/page.tsx navItems)各算一份
 * 狀態/鎖定/文案 → 平行漂移(磚顯 20/20、左欄顯「已送出」;鎖定條件兩套)。
 * 收斂於此:兩處同吃 buildModuleNav(),只有版面(磚 vs 側欄列)不同。
 *
 * 角色的四模組(2×2):
 *   中心   = 資料準備 / 檢核表 / 實地稽核 / 缺失矯正
 *   委員   = 資料準備 / 委員審閱 / 實地稽核 / 缺失矯正(限己審)
 *   機關   = 資料準備 / 檢核表 / 缺失矯正 / 改善報告(用印)
 * (機關不參與實地評分;其收尾工作是用印報告 → 第四卡,錨點 #signed-report 與儀表板待辦一致)
 */

export type ModuleKey = 'prep' | 'checklist' | 'audit' | 'def' | 'report';

export type ModuleNavItem = {
  key: ModuleKey;
  title: string;
  /** 一句話副標(側欄列用) */
  sub: string;
  href: string;
  /** 主狀態值(n/N、已送出、進行中…) */
  status: string;
  statusTone: 'default' | 'success' | 'warning' | 'primary';
  /** 卡片補充說明(模組磚用) */
  caption: string;
  /** 非當前階段降權(淡化仍可點) */
  muted: boolean;
  locked: boolean;
  lockedHint?: string;
};

/** 委員審閱窗口狀態(auditorReviewWindowState 的輸出)。 */
export type ReviewWindowState = 'open' | 'before' | 'after' | 'unset';

export type ModuleNavInput = {
  cycleId: string;
  role: Role;
  status: CycleStatus;
  /** 已依角色調整的資料準備讀數(機關=機關區 mech*;中心/委員=全量) */
  prep: { confirmed: number; total: number; draft: number; insufficient: number };
  checklist: { submitted: boolean; answered: number; total: number };
  /** 已依角色調整(委員=限本人審閱)的缺失讀數 */
  def: { total: number; passed: number; pending: number; returned: number };
  /** 用印掃描檔(機關第四卡);中心/委員視角可不帶 */
  report?: { submitted: boolean; confirmed: boolean };
  /** 委員視角必帶:審閱窗口狀態(其餘角色忽略) */
  auditorReviewState?: ReviewWindowState;
};

export function buildModuleNav(i: ModuleNavInput): ModuleNavItem[] {
  const st = i.status;
  const base = `/cycles/${i.cycleId}`;
  const isAuditor = i.role === 'AUDITOR';
  const isOrg = i.role === 'ORG_ADMIN';
  const onsitePast = st === 'REPORT_ISSUED' || st === 'REMEDIATION' || st === 'CLOSED';

  // 階段聚焦:只有「當前階段相關」的入口維持高亮,其餘降權(仍可點)
  const modActive = {
    prep: st === 'DRAFT' || st === 'PREPARATION',
    checklist: st === 'PREPARATION' || st === 'ONSITE',
    audit: st === 'ONSITE',
    def: st === 'REPORT_ISSUED' || st === 'REMEDIATION' || st === 'CLOSED',
    report: st === 'REMEDIATION' || st === 'CLOSED',
  };

  // 委員審閱窗口:不在窗口內(或未設)→ 資料準備/委員審閱鎖定+提示原因
  const reviewState: ReviewWindowState = i.auditorReviewState ?? 'open';
  const reviewLocked = isAuditor && reviewState !== 'open';
  const reviewLockHint = onsiteStageEnded(st)
    ? '實地稽核階段已結束,非審閱時段'
    : reviewState === 'before' ? '委員審閱時段尚未開始'
    : reviewState === 'after' ? '委員審閱時段已結束'
    : '中心尚未設定委員審閱時段';
  // 委員「審閱」實際開放:資料齊備(READY)起可檢視 + 窗口開啟
  const auditorReviewActive = isAuditor && auditorCanViewChecklistContent(st) && reviewState === 'open';

  // ── 資料準備 ──
  const prepDone = i.prep.total > 0 && i.prep.confirmed === i.prep.total;
  const prep: ModuleNavItem = {
    key: 'prep',
    title: '稽核前資料準備',
    sub: isAuditor ? '檢視機關繳交資料' : '附件收集與繳交',
    href: `${base}/prep`,
    status: i.prep.total > 0 ? `${i.prep.confirmed}/${i.prep.total}` : '—',
    statusTone: prepDone ? 'success' : 'default',
    caption: i.prep.total > 0
      ? (prepDone ? '資料齊備' : `待繳 ${i.prep.draft} · 退補 ${i.prep.insufficient}`)
      : '尚無資料需求',
    muted: !modActive.prep,
    locked:
      (isAuditor && (!auditorCanViewChecklistContent(st) || reviewLocked)) ||
      (isOrg && st === 'DRAFT'),
    lockedHint: isOrg
      ? '中心推進至「資料準備中」後開放填報'
      : reviewLocked ? reviewLockHint : '資料齊備後開放委員檢視',
  };

  // ── 檢核表(機關/中心)/ 委員審閱(委員;入口名全站統一,roles#10)──
  const checklist: ModuleNavItem = isAuditor
    ? {
        key: 'checklist',
        title: '委員審閱',
        sub: '逐題檢視機關自評',
        href: `${base}/review`,
        status: onsitePast ? '已完成' : auditorReviewActive ? '進行中' : '待開放',
        statusTone: auditorReviewActive ? 'primary' : 'default',
        caption: '檢視填報、逐題留審查意見',
        muted: !auditorReviewActive,
        locked: !auditorCanViewChecklistContent(st) || reviewLocked,
        lockedHint: reviewLocked ? reviewLockHint : '資料齊備後開放委員審閱',
      }
    : {
        key: 'checklist',
        title: '資通安全檢核表',
        sub: '機關自評與佐證',
        href: `${base}/checklist`,
        status: i.checklist.submitted
          ? '已送出'
          : i.checklist.total > 0 ? `${i.checklist.answered}/${i.checklist.total}` : '—',
        statusTone: i.checklist.submitted ? 'success' : 'default',
        caption: i.checklist.submitted
          ? '線上填報完成'
          : i.checklist.total > 0 ? '逐題填報中' : '待中心開放填報',
        muted: !modActive.checklist,
        locked: isOrg && st === 'DRAFT',
        lockedHint: '中心推進至「資料準備中」後開放填報',
      };

  // ── 實地稽核評分與發現(中心/委員;機關不參與)──
  const audit: ModuleNavItem = {
    key: 'audit',
    title: '實地稽核評分與發現',
    sub: '委員評分與發現',
    href: `${base}/audit`,
    status: onsitePast ? '已完成' : st === 'ONSITE' ? '進行中' : '尚未開始',
    statusTone: st === 'ONSITE' ? 'primary' : 'default',
    caption: '委員線上評分、記錄稽核發現',
    muted: !modActive.audit,
    locked: isAuditor && !auditorCanScore(st),
    lockedHint: '實地稽核階段開始後開放評分與記錄發現',
  };

  // ── 缺失與矯正管考 ──
  // 委員讀數=限本人審閱(呼叫端已過濾):發布後 0 筆對委員顯「無指派」而非「尚未發布」(名實相符)
  const defPublished = st === 'REPORT_ISSUED' || st === 'REMEDIATION' || st === 'CLOSED';
  const def: ModuleNavItem = {
    key: 'def',
    title: '缺失與矯正管考',
    sub: '缺失通知、改善',
    href: `${base}/deficiencies`,
    status: i.def.total > 0 ? `${i.def.passed}/${i.def.total}` : isAuditor && defPublished ? '0 項' : '尚未發布',
    statusTone: i.def.total > 0 && i.def.passed === i.def.total ? 'success' : 'default',
    caption: i.def.total > 0
      ? `待填 ${i.def.pending} · 退回 ${i.def.returned}`
      : isAuditor && defPublished ? '目前無指派您審閱的缺失' : '缺失發布後開放填報',
    muted: !modActive.def,
    locked: i.role !== 'SUPER_ADMIN' && !canAccess('deficiencies.view', i.role, st),
    lockedHint: isOrg ? '矯正執行階段開放填報' : '缺失發布後開放',
  };

  // ── 改善報告(用印)(機關第四卡)──
  const rpt = i.report ?? { submitted: false, confirmed: false };
  const report: ModuleNavItem = {
    key: 'report',
    title: '改善報告(用印)',
    sub: '列印、用印後上傳',
    href: `${base}#signed-report`,
    status: rpt.confirmed ? '已確認' : rpt.submitted ? '已繳交' : modActive.report ? '待上傳' : '—',
    statusTone: rpt.confirmed ? 'success' : rpt.submitted ? 'primary' : 'default',
    caption: rpt.confirmed
      ? '中心已確認收件'
      : rpt.submitted ? '等待中心確認' : '列印改善報告、用印後上傳掃描檔',
    muted: !modActive.report,
    locked: !canAccess('signedReport.section', i.role, st),
    lockedHint: '矯正執行階段開放',
  };

  if (isOrg) return [prep, checklist, def, report];
  return [prep, checklist, audit, def];
}
