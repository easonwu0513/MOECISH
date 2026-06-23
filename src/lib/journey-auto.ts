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
};

const RULES: Record<string, (c: JourneyAutoCtx) => boolean> = {
  always: () => true,
  prep_list_set: (c) => c.facts.prepTotal > 0,
  auditors_assigned: (c) => c.assignmentsCount > 0,
  prep_uploaded: (c) => c.facts.prepTotal - c.facts.prepRemaining > 0,
  checklist_filled: (c) => c.facts.checklistAnswered > 0,
  prep_submitted: (c) =>
    c.facts.checklistSubmitted || c.facts.prepToConfirm > 0 || c.facts.prepConfirmed > 0,
  prep_confirmed: (c) => c.facts.prepConfirmed > 0 || c.facts.prepAllConfirmed,
  onsite_scheduled: (c) => !!c.facts.onsiteDate,
  deficiencies_published: (c) => c.facts.total > 0,
  remediation_submitted: (c) => c.facts.submitted > 0 || c.facts.passed > 0,
  remediation_reviewed: (c) => c.facts.passed > 0 || c.facts.returned > 0,
  signed_uploaded: (c) => c.facts.signedUploaded,
  signed_confirmed: (c) => c.facts.signedConfirmed,
};

/**
 * CYCLE 精靈項目的「快捷跳轉」目的地(相對週期的子路徑;'' = 週期主頁)。
 * 讓各角色點任務即可跳到實際執行頁面(機關→/prep、/checklist;委員→/audit;矯正→/deficiencies…)。
 */
export function journeyItemHref(stageKey: string, autoKey: string | null): string {
  switch (autoKey) {
    case 'checklist_filled': return '/checklist';
    case 'prep_uploaded':
    case 'prep_submitted':
    case 'prep_confirmed': return '/prep';
    case 'deficiencies_published':
    case 'remediation_submitted':
    case 'remediation_reviewed': return '/deficiencies';
    case 'onsite_scheduled':
    case 'signed_uploaded':
    case 'signed_confirmed':
    case 'prep_list_set':
    case 'auditors_assigned':
    case 'always': return ''; // 週期主頁(設定/安排/用印確認在此)
  }
  // 無對應動作鍵者,依階段給預設目的地
  switch (stageKey) {
    case 'PREPARATION':
    case 'READY': return '/prep';
    case 'ONSITE': return '/audit';
    case 'REPORT_ISSUED':
    case 'REMEDIATION': return '/deficiencies';
    default: return '';
  }
}

/** 依週期實況判定某 CYCLE 精靈項目是否已完成。 */
export function autoItemDone(stageKey: string, autoKey: string | null, ctx: JourneyAutoCtx): boolean {
  const curIdx = CYCLE_STATUSES.indexOf(ctx.facts.status);
  const stIdx = CYCLE_STATUSES.indexOf(stageKey as CycleStatus);
  if (stIdx < 0 || curIdx < 0) return false; // 非標準階段 key:無法定位,保守視為未完成
  if (stIdx < curIdx) return true; // 已過階段 → 完成
  if (stIdx > curIdx) return false; // 未到階段
  if (!autoKey) return false; // 目前階段、無對應動作 → 進行中
  return RULES[autoKey]?.(ctx) ?? false;
}
