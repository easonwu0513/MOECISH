import type { CycleStatus } from './types';

/**
 * 稽核週期「階段」單一真實來源(SoT)。
 * 把原本散在 state-machine.ts(7 態 label/tone)與 process-guide.ts(4 步流程)的定義集中於此一處;
 * 兩處改為自本檔 re-export,杜絕「Chip 說缺失發布中、Stepper 畫在步驟3」的同畫面雙重語彙。
 * CYCLE_STATUS_LABELS 與原 state-machine 定義逐字相同;cycleStatusTone 為此處新 SoT,
 * 並「刻意」把進行中態 ONSITE / REMEDIATION 統一為 primary(輕盈版設計;原為 sage / warning),
 * 其餘狀態色不變 — 這是有意的視覺調整,非單純等價收斂。
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
    case 'REMEDIATION':   return 'primary';
    case 'CLOSED':        return 'success';
  }
}

/**
 * StageTone → Tailwind 類別的單一真實來源(border/dot/iconBg)。
 * 取代散落各處的手抄 tone→class 對照表,避免改色漏改、色階漂移。
 */
export function toneClasses(tone: StageTone): { border: string; dot: string; iconBg: string } {
  const map: Record<StageTone, { border: string; dot: string; iconBg: string }> = {
    neutral: { border: 'border-l-outline-variant', dot: 'bg-neutral-400', iconBg: 'bg-neutral-100 text-neutral-600' },
    primary: { border: 'border-l-primary-600', dot: 'bg-primary-500', iconBg: 'bg-primary-50 text-primary-700' },
    sage: { border: 'border-l-sage-500', dot: 'bg-sage-500', iconBg: 'bg-sage-50 text-sage-700' },
    success: { border: 'border-l-success-600', dot: 'bg-success-500', iconBg: 'bg-success-50 text-success-700' },
    warning: { border: 'border-l-warning-500', dot: 'bg-warning-500', iconBg: 'bg-warning-50 text-warning-700' },
    danger: { border: 'border-l-danger-600', dot: 'bg-danger-500', iconBg: 'bg-danger-50 text-danger-700' },
  };
  return map[tone];
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

/**
 * 委員指派是否仍可「新增」:僅「實地稽核(ONSITE)」及之前的階段可新增指派;
 * 進入「缺失發布中(REPORT_ISSUED)」起,委員名單凍結,不得再新增(避免實地稽核結束後才補指派委員)。
 * client(AssignAuditorsPanel)與 server(assignments POST)共用此單一判斷,避免前後端不一致。
 */
export function canAssignAuditors(status: CycleStatus): boolean {
  return status === 'DRAFT' || status === 'PREPARATION' || status === 'READY' || status === 'ONSITE';
}
