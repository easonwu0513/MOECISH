import type { Role } from './types';

/**
 * 角色 × 週期階段 的「粗粒度」存取政策 —— 單一真實來源(SoT)。
 *
 * 背景:本系統無授權 middleware,授權靠各 route 自律(見 lib/rbac);過去「誰在哪個階段能看/能做什麼」
 * 散落在各頁面/各 API,逐處各寫一次,漏一處即破口(2026-06 一連串階段權限 bug 的共同根因)。
 * 本模組把「角色 × 階段」這層收斂成單一函式 canAccess,讓頁面、API、週期頁入口磚、與真值表測試
 * (src/scripts/test-access-matrix.ts)全部對齊同一處,避免漂移。
 *
 * 邊界:此處只管「角色 × 階段」的粗粒度閘。細粒度仍由呼叫端把關:
 *  - 租戶/指派隔離:assertCycleAccess / assertEvidenceAccess(lib/rbac)
 *  - 項目狀態:檢核表已送出、prep 已繳交/已確認、用印掃描檔已確認/已結案鎖定等
 */

/** 週期 7 階段順序(資料準備分界 = 進入 READY「資料齊備」後才對委員開放機關資料)。 */
export const CYCLE_PHASE_ORDER = [
  'DRAFT', 'PREPARATION', 'READY', 'ONSITE', 'REPORT_ISSUED', 'REMEDIATION', 'CLOSED',
] as const;
export type CyclePhase = (typeof CYCLE_PHASE_ORDER)[number];

/** 「資料準備中」(含開立中):委員一律尚不可見機關資料(檢核表/佐證/評分依據)。 */
function inPrepPhase(cycleStatus: string): boolean {
  return cycleStatus === 'DRAFT' || cycleStatus === 'PREPARATION';
}

/** 受「角色 × 階段」管制的介面(頁面/API/動作/入口磚)。 */
export type Surface =
  | 'checklist.view' // 委員檢視機關檢核表內容(檢核表頁/審閱頁/匯出/佐證 list+download/留言)
  | 'prep.orgEdit' // 機關上傳/填無相關文件說明/確定繳交 資料準備
  | 'signedReport.section' // 「用印掃描檔」整段可見
  | 'signedReport.upload' // 上傳用印掃描檔
  | 'auditReport.view'; // 彙整報告(全體委員整合;中心專用)

/**
 * 某角色在某週期階段是否可存取某介面(粗粒度)。所有頁面/API/磚請改呼叫此處,不要各自內聯階段判斷。
 */
export function canAccess(surface: Surface, role: Role, cycleStatus: string): boolean {
  switch (surface) {
    case 'checklist.view':
      // 委員一律於離開資料準備(進入資料齊備 READY)後才可見機關檢核表;機關看自家、中心全程(細粒度租戶/指派另管)
      return role === 'AUDITOR' ? !inPrepPhase(cycleStatus) : true;

    case 'prep.orgEdit':
      // 機關上傳/填說明僅限「資料準備中」;開立中(DRAFT)尚未開放,離開資料準備後凍結(中心匯入區另由中心處理)
      return role === 'ORG_ADMIN' && cycleStatus === 'PREPARATION';

    case 'signedReport.section':
      // 用印掃描檔屬機關用印 + 中心確認之收尾(矯正執行中之後才出現);委員不參與
      return role !== 'AUDITOR' && (cycleStatus === 'REMEDIATION' || cycleStatus === 'CLOSED');

    case 'signedReport.upload':
      // 僅機關上傳(中心只檢視+確認);結案後不可再上傳(已確認鎖定屬項目狀態,由呼叫端另判)
      return role === 'ORG_ADMIN' && cycleStatus !== 'CLOSED';

    case 'auditReport.view':
      // 彙整報告為中心(最高管理員)專用;委員印自己的附件17、機關不涉入
      return role === 'SUPER_ADMIN';
  }
}
