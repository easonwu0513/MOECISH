import { canAccess } from './access-policy';

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

/** 角色 → Chip 色調(單一來源,確保同角色跨頁同色;以 UserMenu 既有對應為準) */
export const ROLE_TONE: Record<Role, 'primary' | 'sage' | 'warning'> = {
  SUPER_ADMIN: 'primary',
  AUDITOR: 'sage',
  ORG_ADMIN: 'warning',
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
// 引導式精靈（Guided Journey）
// ════════════════════════════════════════════

// CYCLE：每家醫院一個週期，依 7 狀態階段、分角色逐項。
// PROGRAMME：中心年度計畫執行 SOP（跨院、一次性），依年度綁定進度。
export const JOURNEY_SCOPES = ['CYCLE', 'PROGRAMME'] as const;
export type JourneyScope = (typeof JOURNEY_SCOPES)[number];

export const JOURNEY_SCOPE_LABELS: Record<JourneyScope, string> = {
  CYCLE: '週期各階段',
  PROGRAMME: '中心年度計畫執行',
};

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

// 資料準備狀態機:
//   EMPTY(未處理) → UPLOADED(已處理・待確定繳交/草稿,機關仍可改) → SUBMITTED(機關「確定繳交」,鎖定待中心審核) → CONFIRMED(中心確認齊備)
//   SUBMITTED/CONFIRMED →(中心退回補正)→ INSUFFICIENT(解鎖,機關補正後重新繳交)
// 機關「已處理」一項 = 有檔案 或 已填「無相關文件理由」(二擇一)。委員僅見 CONFIRMED。
export const PREP_STATUSES = ['EMPTY', 'UPLOADED', 'SUBMITTED', 'CONFIRMED', 'INSUFFICIENT'] as const;
export type PrepStatus = (typeof PREP_STATUSES)[number];

// 狀態徽章文案:兩個易錯位的狀態寫全,機關/中心兩端讀起來都正確——
// UPLOADED 讓機關知道「上傳/敘明完還要按確定繳交」(已處理=有檔或已敘明,見上);
// SUBMITTED 讓機關知道中心在審、讓中心知道待自己審。
export const PREP_STATUS_LABELS: Record<PrepStatus, string> = {
  EMPTY: '尚未處理',
  UPLOADED: '已處理・待確定繳交',
  SUBMITTED: '已繳交・待中心審核',
  CONFIRMED: '已確認齊備',
  INSUFFICIENT: '已退回',
};

/** 機關此時可否編輯該項(上傳/刪檔/改理由):已繳交、已確認齊備 → 鎖定。 */
export function prepOrgEditable(s: string): boolean {
  return s === 'EMPTY' || s === 'UPLOADED' || s === 'INSUFFICIENT';
}
/** 中心此時可否審核該項(確認/退回):僅機關已繳交或已確認(已確認仍可再退回)。 */
export function prepReviewable(s: string): boolean {
  return s === 'SUBMITTED' || s === 'CONFIRMED';
}

// 資料準備三區:技術檢測 / 實地稽核(機關繳交,各有截止日);中心匯入(中心上傳,無機關繳交)。委員三區皆可審。
export const PREP_CATEGORIES = ['TECH', 'ONSITE', 'CENTER'] as const;
export type PrepCategory = (typeof PREP_CATEGORIES)[number];
export const PREP_CATEGORY_LABELS: Record<PrepCategory, string> = {
  TECH: '技術檢測',
  ONSITE: '實地稽核',
  CENTER: '中心匯入',
};
/** 該區是否為「中心匯入」(中心上傳、無機關繳交/確認流程)。 */
export function isCenterCategory(c: string): boolean {
  return c === 'CENTER';
}
/**
 * 委員是否可檢視某資料準備項(單一真實來源,API 與畫面共用):
 * 委員一律在週期離開「資料準備中」、進入「資料齊備」階段後才檢視 —— 機關區(TECH/ONSITE)與中心匯入(CENTER)
 * 都同步於「資料齊備」一起開放;即使中心在「資料準備中」已按「開放委員檢視」(CENTER 設為 CONFIRMED),
 * 效果也延到「資料齊備」才對委員生效。與引導式精靈「資料齊備 → 委員檢視已確認齊備之資料」一致。
 */
export function auditorCanSeePrep(status: string, category: string, hasFiles: boolean, cycleStatus: string): boolean {
  if (prepCyclePhaseOpen(cycleStatus)) return false; // DRAFT / PREPARATION 期間一律不開放委員(含中心匯入)
  if (cycleStatus === 'CLOSED') return false; // 結案後對委員鎖定(對齊 cycle.access;含 evidence 下載端點)
  if (category === 'CENTER') return status === 'CONFIRMED' && hasFiles; // 資料齊備起:中心已開放且有檔
  return status === 'CONFIRMED'; // 資料齊備起:機關區已確認齊備
}
/** 該週期階段是否仍開放異動資料準備(離開資料準備中後一律凍結);亦為「委員尚不可見」的分界。
 *  注意:此函式被 auditorCanSeePrep 用來判定「DRAFT/PREPARATION 委員一律不可見」,語意勿改。 */
export function prepCyclePhaseOpen(cycleStatus: string): boolean {
  return cycleStatus === 'DRAFT' || cycleStatus === 'PREPARATION';
}

/** 機關是否可上傳/填說明/繳交資料準備:僅「資料準備中(PREPARATION)」。
 *  邏輯收斂於 access-policy 的 canAccess('prep.orgEdit') 單一真實來源(此為向後相容包裝)。 */
export function prepOrgCanEdit(cycleStatus: string): boolean {
  return canAccess('prep.orgEdit', 'ORG_ADMIN', cycleStatus);
}

/** 機關是否可填寫/送出檢核表(逐題符合度、說明、批次標記、佐證):僅「資料準備中(PREPARATION)」。
 *  開立中(DRAFT)中心尚在設定,機關不可填;送出後另由 checklistSubmittedAt 鎖定。
 *  邏輯收斂於 access-policy 的 canAccess('checklist.orgEdit') 單一真實來源(此為向後相容包裝)。 */
export function checklistOrgCanEdit(cycleStatus: string): boolean {
  return canAccess('checklist.orgEdit', 'ORG_ADMIN', cycleStatus);
}

/** 委員是否可檢視機關「檢核表」內容(逐題答案/說明/佐證):進入「資料齊備(READY)」後才開放。
 *  邏輯收斂於 access-policy 的 canAccess('checklist.view') 單一真實來源(此為向後相容包裝)。 */
export function auditorCanViewChecklistContent(cycleStatus: string): boolean {
  return canAccess('checklist.view', 'AUDITOR', cycleStatus);
}

/** 委員是否可見/可進入此週期:開立中(DRAFT)尚不可見(中心仍在調整委員名單),PREPARATION 起開放。
 *  邏輯收斂於 access-policy 的 canAccess('cycle.access')。 */
export function auditorCanSeeCycle(cycleStatus: string): boolean {
  return canAccess('cycle.access', 'AUDITOR', cycleStatus);
}

/** 委員是否可進入「實地稽核評分與發現」:進入「實地稽核(ONSITE)」階段後才開放(資料齊備僅供熟悉背景)。
 *  邏輯收斂於 access-policy 的 canAccess('audit.score')。 */
export function auditorCanScore(cycleStatus: string): boolean {
  return canAccess('audit.score', 'AUDITOR', cycleStatus);
}

/** 委員是否可檢視「缺失與矯正管考」:缺失發布(REPORT_ISSUED,實地稽核結束)後才開放。
 *  邏輯收斂於 access-policy 的 canAccess('deficiencies.view')。 */
export function auditorCanSeeDeficiencies(cycleStatus: string): boolean {
  return canAccess('deficiencies.view', 'AUDITOR', cycleStatus);
}

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

// 機關上傳格式限制:浮水印僅能套用於 PDF / JPG / PNG;Word、Excel 等可編輯檔須先另存為這些格式再上傳,
// 否則委員審閱到的資料無法加浮水印(防外流失效)。供前端 <input accept> 與後端驗證共用。
export const ORG_UPLOAD_ACCEPT = '.pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png';
const ORG_UPLOAD_MIMES = ['application/pdf', 'image/jpeg', 'image/png'];
/** 機關上傳是否為允許格式(副檔名或 MIME 任一符合即可;Word/Excel/zip 等一律擋下)。 */
export function isOrgUploadAllowed(fileName: string, mime: string): boolean {
  return /\.(pdf|jpe?g|png)$/i.test(fileName) || ORG_UPLOAD_MIMES.includes(mime);
}

// 「文件範本」上傳限制(僅最高管理員於資料準備標準清單使用):範本供機關下載依式填寫,
// 故開放 Word/Excel/ODF 等可編輯格式;巨集啟用格式(docm/xlsm)、網頁/腳本/壓縮檔一律擋。
// 機關端佐證上傳不受此放寬影響(仍走 isOrgUploadAllowed)。
export const TEMPLATE_UPLOAD_ACCEPT = '.doc,.docx,.xls,.xlsx,.odt,.ods,.pdf,.csv,.jpg,.jpeg,.png';
export const TEMPLATE_UPLOAD_MAX_BYTES = 20 * 1024 * 1024;
export function isTemplateUploadAllowed(fileName: string): boolean {
  return /\.(docx?|xlsx?|odt|ods|pdf|csv|jpe?g|png)$/i.test(fileName);
}

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

/** 符合度 → Chip 色調(填報頁與審閱頁共用,確保同符合度同色)。
 *  不適用=主色藍:它是「刻意作答」的狀態,須與灰色的「未作答」明確區隔(UAT 回報兩者同灰易混淆)。 */
export const COMPLIANCE_TONE: Record<ComplianceLevel, 'success' | 'warning' | 'danger' | 'neutral' | 'primary'> = {
  COMPLIANT: 'success',
  PARTIALLY_COMPLIANT: 'warning',
  NON_COMPLIANT: 'danger',
  NOT_APPLICABLE: 'primary',
};

/** 符合度 → 條狀標示底色(卡片頂條;未作答的頂條為 bg-surface-container-high 灰,不適用須與之區隔) */
export const COMPLIANCE_BAR: Record<ComplianceLevel, string> = {
  COMPLIANT: 'bg-success-500',
  PARTIALLY_COMPLIANT: 'bg-warning-500',
  NON_COMPLIANT: 'bg-danger-500',
  NOT_APPLICABLE: 'bg-primary-300',
};
