import type { ActionStatus, CycleStatus, Role } from './types';

// ════════════════════════════════════════════
// 稽核週期狀態機（2.0）
// DRAFT → (PREPARATION → READY → ONSITE →) REPORT_ISSUED → REMEDIATION → CLOSED
// P1 實用路徑：DRAFT → REPORT_ISSUED → REMEDIATION → CLOSED
// P2 啟用資料準備後走完整路徑
// ════════════════════════════════════════════

type CycleTransition = { from: CycleStatus; to: CycleStatus; allowedRoles: Role[] };

export const CYCLE_TRANSITIONS: CycleTransition[] = [
  // 完整路徑（P2 啟用資料準備）
  { from: 'DRAFT',         to: 'PREPARATION',   allowedRoles: ['SUPER_ADMIN'] },
  { from: 'PREPARATION',   to: 'READY',         allowedRoles: ['SUPER_ADMIN', 'AUDITOR'] },
  { from: 'READY',         to: 'ONSITE',        allowedRoles: ['SUPER_ADMIN'] },
  { from: 'ONSITE',        to: 'REPORT_ISSUED', allowedRoles: ['SUPER_ADMIN'] },
  // P1 快速路徑（跳過資料準備）
  { from: 'DRAFT',         to: 'REPORT_ISSUED', allowedRoles: ['SUPER_ADMIN'] },
  // 缺失發布完成 → 開放機關填報
  { from: 'REPORT_ISSUED', to: 'REMEDIATION',   allowedRoles: ['SUPER_ADMIN'] },
  // 全數通過 + 用印掃描上傳 → 結案（API 層另行檢查前置條件）
  { from: 'REMEDIATION',   to: 'CLOSED',        allowedRoles: ['SUPER_ADMIN'] },
];

export function canTransition(from: CycleStatus, to: CycleStatus, role: Role) {
  return CYCLE_TRANSITIONS.some(
    (t) => t.from === from && t.to === to && t.allowedRoles.includes(role),
  );
}

export function nextStatuses(from: CycleStatus, role: Role): CycleStatus[] {
  return CYCLE_TRANSITIONS.filter(
    (t) => t.from === from && t.allowedRoles.includes(role),
  ).map((t) => t.to);
}

// ════════════════════════════════════════════
// 受控回退邊(誤按救回;SUPER_ADMIN 限定,API 層強制填理由)
// 每個狀態僅一個回退目標,理由記入 CycleStateTransition 與稽核軌跡
// ════════════════════════════════════════════

export const CYCLE_ROLLBACKS: CycleTransition[] = [
  { from: 'PREPARATION',   to: 'DRAFT',         allowedRoles: ['SUPER_ADMIN'] },
  { from: 'READY',         to: 'PREPARATION',   allowedRoles: ['SUPER_ADMIN'] },
  { from: 'ONSITE',        to: 'READY',         allowedRoles: ['SUPER_ADMIN'] },
  { from: 'REPORT_ISSUED', to: 'DRAFT',         allowedRoles: ['SUPER_ADMIN'] },
  { from: 'REMEDIATION',   to: 'REPORT_ISSUED', allowedRoles: ['SUPER_ADMIN'] },
  { from: 'CLOSED',        to: 'REMEDIATION',   allowedRoles: ['SUPER_ADMIN'] },
];

export function canRollback(from: CycleStatus, to: CycleStatus, role: Role) {
  return CYCLE_ROLLBACKS.some(
    (t) => t.from === from && t.to === to && t.allowedRoles.includes(role),
  );
}

export function rollbackTargets(from: CycleStatus, role: Role): CycleStatus[] {
  return CYCLE_ROLLBACKS.filter(
    (t) => t.from === from && t.allowedRoles.includes(role),
  ).map((t) => t.to);
}

// 階段 label/tone 已收斂至單一真實來源 lib/stage.ts;此處 re-export 維持既有匯入路徑不變。
export { CYCLE_STATUS_LABELS, cycleStatusTone } from './stage';

// ════════════════════════════════════════════
// 矯正措施狀態機（多輪）
// PENDING → DRAFT → SUBMITTED → PASSED
//                       ↓ RETURN（round+1）
//                    RETURNED → DRAFT(編輯) → SUBMITTED …
// ════════════════════════════════════════════

type ActionTransition = { from: ActionStatus; to: ActionStatus; allowedRoles: Role[] };

export const ACTION_TRANSITIONS: ActionTransition[] = [
  { from: 'PENDING',   to: 'DRAFT',     allowedRoles: ['ORG_ADMIN'] },
  { from: 'DRAFT',     to: 'SUBMITTED', allowedRoles: ['ORG_ADMIN'] },
  { from: 'RETURNED',  to: 'DRAFT',     allowedRoles: ['ORG_ADMIN'] },
  { from: 'RETURNED',  to: 'SUBMITTED', allowedRoles: ['ORG_ADMIN'] },
  { from: 'SUBMITTED', to: 'PASSED',    allowedRoles: ['AUDITOR'] },
  { from: 'SUBMITTED', to: 'RETURNED',  allowedRoles: ['AUDITOR'] },
];

export function canActionTransition(from: ActionStatus, to: ActionStatus, role: Role) {
  return ACTION_TRANSITIONS.some(
    (t) => t.from === from && t.to === to && t.allowedRoles.includes(role),
  );
}

/** 機關可編輯矯正內容的狀態 */
export function actionEditable(status: ActionStatus): boolean {
  return status === 'PENDING' || status === 'DRAFT' || status === 'RETURNED';
}

export function actionStatusTone(
  status: ActionStatus,
): 'neutral' | 'primary' | 'sage' | 'success' | 'warning' | 'danger' {
  switch (status) {
    case 'PENDING':   return 'neutral';
    case 'DRAFT':     return 'primary';
    case 'SUBMITTED': return 'sage';
    case 'RETURNED':  return 'danger';
    case 'PASSED':    return 'success';
  }
}
