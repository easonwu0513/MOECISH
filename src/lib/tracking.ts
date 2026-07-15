import type { Tone } from './tone';
import type { TrackedReviewStatus, TrackedStatus } from './types';

/** 持續列管「待回報」提前提醒天數(nextReportDue 於此天數內視為待回報,置頂機關清單)。 */
export const TRACKED_DUE_SOON_DAYS = 30;

/** 回報期限是否已逾期(nextReportDue 已過)。 */
export function isTrackedOverdue(nextReportDue: Date | string, now: Date = new Date()): boolean {
  return new Date(nextReportDue).getTime() < now.getTime();
}

/** 回報期限是否已到或將到(TRACKED_DUE_SOON_DAYS 天內,含已逾期)。 */
export function isTrackedDueSoon(nextReportDue: Date | string, now: Date = new Date()): boolean {
  return new Date(nextReportDue).getTime() - now.getTime() <= TRACKED_DUE_SOON_DAYS * 86400000;
}

/** 列管狀態 → 色調。 */
export function trackedStatusTone(status: string): Tone {
  return (status as TrackedStatus) === 'COMPLETED' ? 'success' : 'primary';
}

/** 回報審核狀態 → 色調。 */
export function trackedReviewTone(reviewStatus: string): Tone {
  switch (reviewStatus as TrackedReviewStatus) {
    case 'COMPLETE':
      return 'success';
    case 'CONTINUE':
      return 'sage';
    case 'RETURNED':
      return 'danger';
    default:
      return 'warning'; // PENDING
  }
}
