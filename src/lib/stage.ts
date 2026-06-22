import type { CycleStatus } from './types';

/**
 * 稽核週期「階段」單一真實來源(SoT)。
 * 把原本散在 state-machine.ts(7 態 label/tone)與 process-guide.ts(4 步流程)的定義集中於此一處;
 * 兩處改為自本檔 re-export,杜絕「Chip 說缺失發布中、Stepper 畫在步驟3」的同畫面雙重語彙。
 * 值與原定義逐字相同 → 對既有畫面為等價(行為不變),只是收斂定義點。
 */

export type StageTone = 'neutral' | 'primary' | 'sage' | 'success' | 'warning' | 'danger';

/** 7 個週期狀態的顯示名稱。 */
export const CYCLE_STATUS_LABELS: Record<CycleStatus, string> = {
  DRAFT: '開立中',
  PREPARATION: '資料準備中',
  READY: '資料齊備',
  ONSITE: '實地稽核',
  REPORT_ISSUED: '缺失發布中',
  REMEDIATION: '矯正執行中',
  CLOSED: '結案',
};

/** 7 個週期狀態對應的色調(Chip/徽章)。 */
export function cycleStatusTone(status: CycleStatus): StageTone {
  switch (status) {
    case 'DRAFT':         return 'neutral';
    case 'PREPARATION':   return 'primary';
    case 'READY':         return 'sage';
    case 'ONSITE':        return 'primary';
    case 'REPORT_ISSUED': return 'warning';
    case 'REMEDIATION':   return 'danger';
    case 'CLOSED':        return 'success';
  }
}

/** 對外四步驟流程(前台首頁與後台 Stepper 共用)。 */
export const PROCESS_STEPS = [
  { no: 1, title: '資料準備' },
  { no: 2, title: '實地稽核' },
  { no: 3, title: '缺失矯正' },
  { no: 4, title: '審查結案' },
] as const;

/**
 * 週期狀態 → 流程步驟位置。
 * 0 = 籌備中(尚未進入流程);1–4 = 對應步驟進行中;5 = 全部完成(結案)。
 * REMEDIATION 且全數通過時視為已走到「審查結案」。
 */
export function cycleStepIndex(status: CycleStatus, allPassed: boolean): number {
  switch (status) {
    case 'DRAFT':         return 0;
    case 'PREPARATION':   return 1;
    case 'READY':         return 1;
    case 'ONSITE':        return 2;
    case 'REPORT_ISSUED': return 3;
    case 'REMEDIATION':   return allPassed ? 4 : 3;
    case 'CLOSED':        return 5;
  }
}

/** 該狀態歸屬的流程步驟標題(供 Stepper 於當前步同時顯示精確狀態,止血雙重語彙)。 */
export function stepTitleOfStatus(status: CycleStatus): string {
  const idx = cycleStepIndex(status, false);
  return PROCESS_STEPS.find((s) => s.no === idx)?.title ?? '';
}
