import type { ExecStatus } from './types';

/** 矯正措施送審必填欄位檢核所需的最小欄位集(個別/批次送審共用)。 */
export type ActionForValidation = {
  rootCause: string | null;
  measureStrategy: string | null;
  measureManagement: string | null;
  measureTechnical: string | null;
  plannedDate: Date | null;
  trackingMethod: string | null;
  execStatus: string | null;
  actualDate: Date | null;
  extendedDate: Date | null;
  delayReason: string | null;
};

/**
 * 矯正措施送審必填欄位檢核(對齊範本);回傳缺漏欄位清單(空陣列=完整可送)。
 * 個別送審(action/submit)與批次一輪送審(deficiencies/submit-round)共用同一規則,避免兩路徑漂移。
 */
export function missingActionFields(action: ActionForValidation): string[] {
  const missing: string[] = [];
  if (!action.rootCause?.trim()) missing.push('發生原因（根因分析）');
  if (
    !action.measureStrategy?.trim() &&
    !action.measureManagement?.trim() &&
    !action.measureTechnical?.trim()
  ) {
    missing.push('至少一項改善措施');
  }
  if (!action.plannedDate) missing.push('預計完成時程');
  if (!action.trackingMethod?.trim()) missing.push('進度追蹤方式');
  if (!action.execStatus) missing.push('執行情形');
  const exec = action.execStatus as ExecStatus | null;
  if ((exec === 'ON_TIME_DONE' || exec === 'LATE_DONE') && !action.actualDate) {
    missing.push('實際完成日期');
  }
  if (exec === 'LATE_IN_PROGRESS' && !action.extendedDate) {
    missing.push('預計完成日期延長至');
  }
  if ((exec === 'LATE_DONE' || exec === 'LATE_IN_PROGRESS') && !action.delayReason?.trim()) {
    missing.push('逾期原因');
  }
  return missing;
}
