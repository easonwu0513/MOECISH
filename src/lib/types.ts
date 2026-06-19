// ════════════════════════════════════════════
// 角色（2.0：四角色簡化為三角色）
// ════════════════════════════════════════════

export const ROLES = ['SUPER_ADMIN', 'ORG_ADMIN', 'AUDITOR'] as const;
export type Role = (typeof ROLES)[number];

export const ROLE_LABELS: Record<Role, string> = {
  SUPER_ADMIN: '最高管理員',
  ORG_ADMIN: '機關管理員',
  AUDITOR: '稽核委員',
};

// ════════════════════════════════════════════
// 稽核週期狀態（2.0 生命週期）
// ════════════════════════════════════════════

export const CYCLE_STATUSES = [
  'DRAFT',          // 草稿（開立中）
  'PREPARATION',    // 稽核前資料準備（P2）
  'READY',          // 資料齊備（P2）
  'ONSITE',         // 實地稽核
  'REPORT_ISSUED',  // 缺失發布中
  'REMEDIATION',    // 矯正執行（填報/審查/多輪）
  'CLOSED',         // 結案
] as const;
export type CycleStatus = (typeof CYCLE_STATUSES)[number];

// ════════════════════════════════════════════
// 模組 C：缺失與矯正（對齊教育部範本）
// ════════════════════════════════════════════

export const DEFICIENCY_ASPECTS = ['STRATEGY', 'MANAGEMENT', 'TECHNICAL'] as const;
export type DeficiencyAspect = (typeof DEFICIENCY_ASPECTS)[number];

export const DEFICIENCY_ASPECT_LABELS: Record<DeficiencyAspect, string> = {
  STRATEGY: '策略面',
  MANAGEMENT: '管理面',
  TECHNICAL: '技術面',
};

export const DEFICIENCY_TYPES = ['IMPROVE', 'SUGGEST'] as const;
export type DeficiencyType = (typeof DEFICIENCY_TYPES)[number];

export const DEFICIENCY_TYPE_LABELS: Record<DeficiencyType, string> = {
  IMPROVE: '待改善事項',
  SUGGEST: '建議事項',
};

export const ACTION_STATUSES = [
  'PENDING',    // 待填報
  'DRAFT',      // 填寫中
  'SUBMITTED',  // 已送審
  'RETURNED',   // 退回補正
  'PASSED',     // 審核通過
] as const;
export type ActionStatus = (typeof ACTION_STATUSES)[number];

export const ACTION_STATUS_LABELS: Record<ActionStatus, string> = {
  PENDING: '待填報',
  DRAFT: '填寫中',
  SUBMITTED: '已送審',
  RETURNED: '退回補正',
  PASSED: '審核通過',
};

/** 執行情形（範本四選一） */
export const EXEC_STATUSES = [
  'ON_TIME_DONE',     // 如期完成
  'IN_PROGRESS',      // 未逾期辦理中
  'LATE_DONE',        // 逾期完成
  'LATE_IN_PROGRESS', // 逾期辦理中
] as const;
export type ExecStatus = (typeof EXEC_STATUSES)[number];

export const EXEC_STATUS_LABELS: Record<ExecStatus, string> = {
  ON_TIME_DONE: '如期完成',
  IN_PROGRESS: '未逾期辦理中',
  LATE_DONE: '逾期完成',
  LATE_IN_PROGRESS: '逾期辦理中',
};

export const REVIEW_DECISIONS = ['PASS', 'RETURN'] as const;

// ════════════════════════════════════════════
// 模組 B：資料準備（P2）
// ════════════════════════════════════════════

export const PREP_STATUSES = ['EMPTY', 'UPLOADED', 'CONFIRMED', 'INSUFFICIENT'] as const;
export type PrepStatus = (typeof PREP_STATUSES)[number];

export const PREP_STATUS_LABELS: Record<PrepStatus, string> = {
  EMPTY: '尚未上傳',
  UPLOADED: '已上傳',
  CONFIRMED: '委員已確認',
  INSUFFICIENT: '缺件',
};

// ════════════════════════════════════════════
// 前台公告（P3）
// ════════════════════════════════════════════

export const POST_CATEGORIES = ['ANNOUNCEMENT', 'INTEL', 'VULN_ALERT', 'EVENT'] as const;
export type PostCategory = (typeof POST_CATEGORIES)[number];

export const POST_CATEGORY_LABELS: Record<PostCategory, string> = {
  ANNOUNCEMENT: '平台公告',
  INTEL: '資安情資',
  VULN_ALERT: '漏洞警訊',
  EVENT: '活動訊息',
};

export const POST_STATUSES = ['DRAFT', 'PUBLISHED', 'ARCHIVED'] as const;
export type PostStatus = (typeof POST_STATUSES)[number];

// ════════════════════════════════════════════
// 共用
// ════════════════════════════════════════════

export const EVIDENCE_TARGET_TYPES = [
  'CHECKLIST_RESPONSE',
  'CORRECTIVE_ACTION',
  'PREP_SUBMISSION',
  'AUDIT_CYCLE',
] as const;
export type EvidenceTargetType = (typeof EVIDENCE_TARGET_TYPES)[number];

// ════════════════════════════════════════════
// 檢核表模組（保留為選用功能）
// ════════════════════════════════════════════

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

/** 符合度 → Chip 色調(填報頁與審閱頁共用,確保同符合度同色) */
export const COMPLIANCE_TONE: Record<ComplianceLevel, 'success' | 'warning' | 'danger' | 'neutral'> = {
  COMPLIANT: 'success',
  PARTIALLY_COMPLIANT: 'warning',
  NON_COMPLIANT: 'danger',
  NOT_APPLICABLE: 'neutral',
};

/** 符合度 → 條狀標示底色(卡片頂條) */
export const COMPLIANCE_BAR: Record<ComplianceLevel, string> = {
  COMPLIANT: 'bg-success-500',
  PARTIALLY_COMPLIANT: 'bg-warning-500',
  NON_COMPLIANT: 'bg-danger-500',
  NOT_APPLICABLE: 'bg-outline-variant',
};
