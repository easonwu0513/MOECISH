export const ROLES = ['ADMIN', 'AUDITOR', 'RESPONDENT', 'SUPERVISOR'] as const;
export type Role = (typeof ROLES)[number];

export const DIMENSIONS = [
  'CORE_BUSINESS',
  'POLICY_ORG',
  'STAFFING_BUDGET',
  'ASSET_RISK',
  'OUTSOURCING',
  'MAINTENANCE_KPI',
  'PROTECTION_CONTROL',
  'SYSTEM_DEV',
  'INCIDENT_RESPONSE',
] as const;
export type Dimension = (typeof DIMENSIONS)[number];

export const COMPLIANCE_LEVELS = [
  'COMPLIANT',
  'PARTIALLY_COMPLIANT',
  'NON_COMPLIANT',
  'NOT_APPLICABLE',
] as const;
export type ComplianceLevel = (typeof COMPLIANCE_LEVELS)[number];

export const COMPLIANCE_LABELS: Record<ComplianceLevel, string> = {
  COMPLIANT: '符合',
  PARTIALLY_COMPLIANT: '部分符合',
  NON_COMPLIANT: '不符合',
  NOT_APPLICABLE: '不適用',
};

export const CYCLE_STATUSES = [
  'DRAFT',
  'RESPONDENT_SUBMITTED',
  'SUPERVISOR_APPROVED',
  'IN_REVIEW',
  'COMMENTS_RETURNED',
  'ONSITE_SCHEDULED',
  'FINDINGS_ISSUED',
  'REMEDIATION_IN_PROGRESS',
  'CLOSED',
] as const;
export type CycleStatus = (typeof CYCLE_STATUSES)[number];

export const FINDING_ASPECTS = ['STRATEGY', 'MANAGEMENT', 'TECHNICAL'] as const;
export type FindingAspect = (typeof FINDING_ASPECTS)[number];

export const FINDING_ASPECT_LABELS: Record<FindingAspect, string> = {
  STRATEGY: '策略面',
  MANAGEMENT: '管理面',
  TECHNICAL: '技術面',
};

export const FINDING_TYPES = ['LEGAL_COMPLIANT', 'NEEDS_IMPROVEMENT', 'SUGGESTION'] as const;
export type FindingType = (typeof FINDING_TYPES)[number];

export const FINDING_TYPE_LABELS: Record<FindingType, string> = {
  LEGAL_COMPLIANT: '法遵符合情形',
  NEEDS_IMPROVEMENT: '待改善事項',
  SUGGESTION: '建議事項',
};

export const REMEDIATION_STATUSES = [
  'PENDING',
  'DRAFT',
  'SUBMITTED',
  'APPROVED',
  'NEEDS_REWORK',
] as const;
export type RemediationStatus = (typeof REMEDIATION_STATUSES)[number];

export const EVIDENCE_TARGET_TYPES = [
  'CHECKLIST_RESPONSE',
  'REMEDIATION',
  'AUDIT_CYCLE',
] as const;
export type EvidenceTargetType = (typeof EVIDENCE_TARGET_TYPES)[number];

export const SIGNATURE_ROLES = ['RESPONDENT', 'SUPERVISOR'] as const;
export type SignatureRole = (typeof SIGNATURE_ROLES)[number];
