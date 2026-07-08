import { CYCLE_STATUSES, type CycleStatus } from './types';
import type { CycleFacts } from './process-guide';

/**
 * 週期(CYCLE)引導式精靈「自動完成」判定 SoT。
 * 使用者要求:各階段任務不由人手勾選,而是「在系統中完成該操作後自動變為已完成」。
 * 規則:
 *  - 已過階段(stageIndex < 目前階段)→ 視為完成。
 *  - 未到階段(stageIndex > 目前階段)→ 未完成。
 *  - 目前階段 → 依 autoKey 對應規則,讀週期實況(deriveCycleFacts + 委員指派數)判定;無 autoKey → 進行中(未完成)。
 * 純函式(可在 server 安心使用),不寫資料庫、不需 JourneyProgress。
 */

export type JourneyAutoCtx = {
  facts: CycleFacts;
  assignmentsCount: number;
  /** 本週期已配對的觀察員數(CycleObserver;「指派觀察員」項自動完成判定)。 */
  observersCount: number;
  /** 是否已寄發「稽核作業通知」給機關(開立中「通知機關」項自動完成判定)。 */
  orgNotified: boolean;
  /** 中心匯入區資料是否皆已上傳並「開放委員檢視」(CONFIRMED);無中心匯入項則視為已完成。 */
  centerDataReleased: boolean;
};

const RULES: Record<string, (c: JourneyAutoCtx) => boolean> = {
  always: () => true,
  // 「設定文件繳交期限與稽核日期」:有設文件繳交截止 + 實地稽核日才算完成
  // (取代原 always:一建立週期就被打勾的問題)。矯正填報截止不在此(實地稽核發文後才設)。
  dates_set: (c) => !!c.facts.prepDueDate && !!c.facts.onsiteDate,
  prep_list_set: (c) => c.facts.prepTotal > 0,
  auditors_assigned: (c) => c.assignmentsCount > 0,
  // 「指派觀察員」(批30 師徒制):已配對至少一位觀察員才算完成(觀察員為選配,僅手動加項者才綁此鍵)
  observers_assigned: (c) => c.observersCount > 0,
  // 「通知機關」:已寄發稽核作業通知(notify-open;需先設實地稽核日)才算完成
  org_notified: (c) => c.orgNotified,
  // 「上傳並開放中心匯入區資料」:中心匯入區皆已上傳並按「開放委員檢視」(CONFIRMED)才算完成
  center_data_released: (c) => c.centerDataReleased,
  // 機關區「上傳/繳交/確認」三項一律以「全部完成」判定(非「任一」):機關區=技術檢測+實地稽核。
  // 例:只傳了技術檢測、實地稽核未傳 → 不算「已上傳」;只確認了技術檢測 → 不算「已逐項確認」。
  prep_uploaded: (c) => c.facts.mechAllAddressed,
  // 自評檢核表「填報」以「已送出」為準(checklistSubmitted),非答了任一題就算完成。
  checklist_filled: (c) => c.facts.checklistSubmitted,
  prep_submitted: (c) => c.facts.mechAllSubmitted,
  // 分類繳交(技術檢測/實地稽核截止日不同,可分次繳交 → 精靈拆兩項;該類無項目視為完成)
  prep_submitted_tech: (c) => c.facts.mechTechAllSubmitted,
  prep_submitted_onsite: (c) => c.facts.mechOnsiteAllSubmitted,
  prep_confirmed: (c) => c.facts.mechAllConfirmed,
  onsite_scheduled: (c) => !!c.facts.onsiteDate,
  deficiencies_published: (c) => c.facts.total > 0,
  // 「逐項填報...送審」以「全部送審」為準(比照機關區 mechAllSubmitted 的全部完成原則):
  // 須無待填(toFill)且無退回(returned)——只要還有一項未送審或被退回,即未完成(修正原 submitted>0 只要送出一項就打勾的問題)。
  remediation_submitted: (c) => c.facts.total > 0 && c.facts.toFill === 0 && c.facts.returned === 0,
  remediation_reviewed: (c) => c.facts.passed > 0 || c.facts.returned > 0,
  signed_uploaded: (c) => c.facts.signedUploaded,
  signed_confirmed: (c) => c.facts.signedConfirmed,
};

/**
 * 系統訊號目錄(供 /admin/journey 編輯器「完成判定=系統自動」的下拉;鍵須 ∈ AUTO_RULES)。
 * 管理員手動新增的項目綁定其中一鍵,即可由系統自動打勾(回應 UAT:「手動新增的項目如何讓系統辨別完成」)。
 */
export const AUTO_KEY_OPTIONS: { key: string; label: string }[] = [
  { key: 'always', label: '建立週期即完成(常駐)' },
  { key: 'dates_set', label: '已設定文件繳交期限與稽核日期' },
  { key: 'prep_list_set', label: '已掛上資料準備需求清單' },
  { key: 'auditors_assigned', label: '已指派至少一位稽核委員' },
  { key: 'observers_assigned', label: '已配對至少一位觀察員' },
  { key: 'org_notified', label: '已寄發稽核作業通知給機關' },
  { key: 'center_data_released', label: '中心匯入區已上傳並開放委員檢視' },
  { key: 'prep_uploaded', label: '機關區資料全部已上傳/敘明' },
  { key: 'checklist_filled', label: '自評檢核表已送出' },
  { key: 'prep_submitted', label: '機關區資料全部已確定繳交' },
  { key: 'prep_submitted_tech', label: '技術檢測資料全部已繳交' },
  { key: 'prep_submitted_onsite', label: '實地稽核資料全部已繳交' },
  { key: 'prep_confirmed', label: '機關區資料全部確認齊備' },
  { key: 'onsite_scheduled', label: '已設定實地稽核日期' },
  { key: 'deficiencies_published', label: '已發布至少一項缺失' },
  { key: 'remediation_submitted', label: '矯正措施全部送審(無待填無退回)' },
  { key: 'remediation_reviewed', label: '矯正審查已開始(有通過或退回)' },
  { key: 'signed_uploaded', label: '用印掃描檔已上傳' },
  { key: 'signed_confirmed', label: '用印掃描檔已經中心確認' },
];

/** 快捷跳轉目的地目錄(供編輯器「跳轉設定」下拉;值=相對週期子路徑或錨點,''=週期主頁)。 */
export const HREF_OPTIONS: { value: string; label: string }[] = [
  { value: '', label: '週期主頁' },
  { value: '/prep', label: '稽核前資料準備' },
  { value: '/checklist', label: '資通安全檢核表' },
  { value: '/review', label: '委員審閱' },
  { value: '/audit', label: '實地稽核評分與發現' },
  { value: '/audit/report', label: '彙整報告' },
  { value: '/deficiencies', label: '缺失與矯正管考' },
  { value: '/settings#assign-auditors', label: '委員指派(進階設定)' },
  { value: '/settings#assign-observers', label: '觀察員配對(進階設定)' },
  { value: '#setup', label: '日期設定(頁內)' },
  { value: '#signed-report', label: '用印報告(頁內)' },
];

/**
 * CYCLE 精靈項目的「快捷跳轉」目的地(相對週期的子路徑;'' = 週期主頁)。
 * 讓各角色點任務即可跳到實際執行頁面(機關→/prep、/checklist;委員→/review、/audit;矯正→/deficiencies…)。
 * 純提醒項(無 autoKey)亦給目的地:先依標題關鍵字精準對應,否則用階段預設(方便委員一點即達)。
 */
export function journeyItemHref(stageKey: string, autoKey: string | null, title?: string): string {
  // 實地稽核階段「留存查核紀錄、稽核結束後彙整缺失」(最高管理員)→ 彙整委員稽核發現報告。
  // (與「缺失發布中」的『以表單/Excel 發布缺失』共用 autoKey deficiencies_published,但去處不同:此處去彙整報告,發布缺失才去 /deficiencies)
  if (stageKey === 'ONSITE' && (title?.includes('彙整') || title?.includes('留存查核紀錄'))) {
    return '/audit/report';
  }
  switch (autoKey) {
    case 'checklist_filled': return '/checklist';
    case 'prep_uploaded':
    case 'prep_submitted':
    case 'prep_submitted_tech':
    case 'prep_submitted_onsite':
    case 'prep_confirmed':
    case 'center_data_released': return '/prep';
    case 'deficiencies_published':
    case 'remediation_submitted':
    case 'remediation_reviewed': return '/deficiencies';
    case 'onsite_scheduled':
    case 'signed_uploaded':
    case 'signed_confirmed': return ''; // 委員安排/用印確認在週期主頁
    case 'prep_list_set': return '/prep'; // 資料準備需求清單於 /prep 設定
    case 'auditors_assigned': return '/settings#assign-auditors'; // 委員指派面板(批34 起在進階設定頁)
    case 'observers_assigned': return '/settings#assign-observers'; // 觀察員配對面板(進階設定頁)
    case 'dates_set': return '#setup'; // 設定文件繳交期限與稽核日期 → 跳頁首設定區(編輯日期)
    case 'org_notified': return '#setup'; // 通知機關 → 跳頁首(「通知機關」按鈕在身分帶,與編輯日期同列)
    case 'always':
      // 開立中(建立週期)→ 跳頁首設定區;其餘階段的 always 維持週期主頁
      return stageKey === 'DRAFT' ? '#setup' : '';
  }
  // 無對應動作鍵(純提醒):委員相關階段依標題分流——「審閱」→審閱頁、「評分/發現」→實地稽核頁、「檢核表」→檢核表頁
  const t = title ?? '';
  if (stageKey === 'ONSITE' || stageKey === 'READY') {
    if (t.includes('審閱')) return '/review';
    if (t.includes('評分') || t.includes('發現')) return '/audit';
    if (t.includes('檢核表')) return '/checklist';
  }
  // 其餘依階段給預設目的地
  switch (stageKey) {
    case 'PREPARATION':
    case 'READY': return '/prep';
    case 'ONSITE': return '/audit';
    case 'REPORT_ISSUED':
    case 'REMEDIATION': return '/deficiencies';
    default: return '';
  }
}

/** 週期是否已「到達」某階段(目前階段 index >= 該階段 index)。
 *  用於精靈快捷跳轉:僅已到達之階段才連結到實際頁面;未到達者點擊改提示「尚未開放」,
 *  避免委員/機關點未來階段提醒被導回週期頁、誤以為功能壞掉。 */
export function cycleStageReached(stageKey: string, cycleStatus: string): boolean {
  const st = CYCLE_STATUSES.indexOf(stageKey as CycleStatus);
  // 自訂階段(非七大標準狀態,如「測試」「共識會議」)不參與狀態機,無「到達與否」可言 →
  // 視為已到達,讓其「必做·手動勾選」項可隨時勾選、快捷跳轉可用。
  // (原本 indexOf 回 -1 → 恆 false → 自訂階段手動項永遠鎖死無法勾,為使用者回報的 bug 根因。)
  if (st < 0) return true;
  const cur = CYCLE_STATUSES.indexOf(cycleStatus as CycleStatus);
  return cur >= 0 && st <= cur;
}

/** 依週期實況判定某 CYCLE 精靈項目是否已完成。 */
export function autoItemDone(stageKey: string, autoKey: string | null, ctx: JourneyAutoCtx): boolean {
  const curIdx = CYCLE_STATUSES.indexOf(ctx.facts.status);
  const stIdx = CYCLE_STATUSES.indexOf(stageKey as CycleStatus);
  if (stIdx < 0 || curIdx < 0) return false; // 非標準階段 key:無法定位,保守視為未完成
  // 收尾項目(用印報告上傳/結案確認)實際發生在 REMEDIATION 末段(機關上傳→中心確認後才轉 CLOSED),
  // 故掛在 CLOSED 階段者,自 REMEDIATION 起就依實況判定,避免在收尾期顯示與實情相反。
  if (
    (autoKey === 'signed_uploaded' || autoKey === 'signed_confirmed') &&
    curIdx >= CYCLE_STATUSES.indexOf('REMEDIATION')
  ) {
    return RULES[autoKey]?.(ctx) ?? false;
  }
  if (stIdx < curIdx) return true; // 已過階段 → 完成
  if (stIdx > curIdx) return false; // 未到階段
  if (!autoKey) return false; // 目前階段、無對應動作 → 進行中
  return RULES[autoKey]?.(ctx) ?? false;
}
