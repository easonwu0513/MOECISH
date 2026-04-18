import type { CycleStatus, RemediationStatus, Role } from './types';

type CycleTransition = { from: CycleStatus; to: CycleStatus; allowedRoles: Role[] };

export const CYCLE_TRANSITIONS: CycleTransition[] = [
  { from: 'DRAFT',                   to: 'RESPONDENT_SUBMITTED',    allowedRoles: ['RESPONDENT'] },
  { from: 'RESPONDENT_SUBMITTED',    to: 'DRAFT',                   allowedRoles: ['SUPERVISOR'] },
  { from: 'RESPONDENT_SUBMITTED',    to: 'SUPERVISOR_APPROVED',     allowedRoles: ['SUPERVISOR'] },
  { from: 'SUPERVISOR_APPROVED',     to: 'IN_REVIEW',               allowedRoles: ['ADMIN', 'AUDITOR'] },
  { from: 'IN_REVIEW',               to: 'COMMENTS_RETURNED',       allowedRoles: ['AUDITOR'] },
  { from: 'COMMENTS_RETURNED',       to: 'IN_REVIEW',               allowedRoles: ['RESPONDENT', 'SUPERVISOR'] },
  { from: 'IN_REVIEW',               to: 'ONSITE_SCHEDULED',        allowedRoles: ['ADMIN', 'AUDITOR'] },
  { from: 'ONSITE_SCHEDULED',        to: 'FINDINGS_ISSUED',         allowedRoles: ['AUDITOR'] },
  { from: 'IN_REVIEW',               to: 'FINDINGS_ISSUED',         allowedRoles: ['AUDITOR'] },
  { from: 'FINDINGS_ISSUED',         to: 'REMEDIATION_IN_PROGRESS', allowedRoles: ['ADMIN', 'AUDITOR', 'RESPONDENT'] },
  { from: 'REMEDIATION_IN_PROGRESS', to: 'CLOSED',                  allowedRoles: ['ADMIN', 'AUDITOR'] },
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

type RemTransition = { from: RemediationStatus; to: RemediationStatus; allowedRoles: Role[] };

export const REMEDIATION_TRANSITIONS: RemTransition[] = [
  { from: 'PENDING',      to: 'DRAFT',        allowedRoles: ['RESPONDENT'] },
  { from: 'DRAFT',        to: 'SUBMITTED',    allowedRoles: ['RESPONDENT'] },
  { from: 'SUBMITTED',    to: 'APPROVED',     allowedRoles: ['AUDITOR'] },
  { from: 'SUBMITTED',    to: 'NEEDS_REWORK', allowedRoles: ['AUDITOR'] },
  { from: 'NEEDS_REWORK', to: 'DRAFT',        allowedRoles: ['RESPONDENT'] },
];

export function canRemTransition(from: RemediationStatus, to: RemediationStatus, role: Role) {
  return REMEDIATION_TRANSITIONS.some(
    (t) => t.from === from && t.to === to && t.allowedRoles.includes(role),
  );
}

export const CYCLE_STATUS_LABELS: Record<CycleStatus, string> = {
  DRAFT: '草稿中',
  RESPONDENT_SUBMITTED: '填報人已送出',
  SUPERVISOR_APPROVED: '主管已核可',
  IN_REVIEW: '委員審閱中',
  COMMENTS_RETURNED: '意見退回補正',
  ONSITE_SCHEDULED: '已排實地稽核',
  FINDINGS_ISSUED: '已開立稽核發現',
  REMEDIATION_IN_PROGRESS: '改善進行中',
  CLOSED: '結案',
};

export const REM_STATUS_LABELS: Record<RemediationStatus, string> = {
  PENDING: '尚未填寫',
  DRAFT: '填寫中',
  SUBMITTED: '已送審',
  APPROVED: '審核通過',
  NEEDS_REWORK: '持續改正',
};
