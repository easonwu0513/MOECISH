import { canAccess } from './access-policy';

// ════════════════════════════════════════════
// 角色(2.0 三角色;觀察員批30 增為四角色)
// ════════════════════════════════════════════

// OBSERVER(觀察員):基礎權限對標稽核委員但「學習與練習」定位——獨立審閱窗口、
// 不開放缺失與矯正管考、以「稽核發現撰寫練習」取代評分模組(練習資料硬隔離,
// 絕不進正式報告)。⚠️ 新增角色時,所有 switch(user.role)/角色三元條件必須顯式
// 處理並預設拒絕(歷史上 rbac/access-policy 對未知角色 fail-open,批30 已收斂)。
export const ROLES = ['SUPER_ADMIN', 'ORG_ADMIN', 'AUDITOR', 'OBSERVER'] as const;
export type Role = (typeof ROLES)[number];

export const ROLE_LABELS: Record<Role, string> = {
  SUPER_ADMIN: '最高管理員',
  ORG_ADMIN: '機關管理員',
  AUDITOR: '稽核委員',
  OBSERVER: '觀察員',
};

/** 角色 → Chip 色調(單一來源,確保同角色跨頁同色;以 UserMenu 既有對應為準) */
export const ROLE_TONE: Record<Role, 'primary' | 'sage' | 'warning' | 'neutral'> = {
  SUPER_ADMIN: 'primary',
  AUDITOR: 'sage',
  ORG_ADMIN: 'warning',
  OBSERVER: 'neutral',
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

/** 構面公文序號(一/二/三)——缺失清單頁與列印版共用(原兩頁各自定義,減法批 dup#9 合併)。 */
export const DEFICIENCY_ASPECT_NUM: Record<DeficiencyAspect, string> = {
  STRATEGY: '一',
  MANAGEMENT: '二',
  TECHNICAL: '三',
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
// 批71:歷年未完成缺失「持續列管」
// ════════════════════════════════════════════

/** 觸發拋轉持續列管的執行情形:機關填「辦理中」(未逾期/逾期皆然)而委員仍審核通過 → 週期照常結案,
 *  但事項未真正完成,須跨年度滾動追蹤。「如期完成 / 逾期完成」視為已完成,不拋轉。 */
export const TRACKING_TRIGGER_EXEC: readonly ExecStatus[] = ['IN_PROGRESS', 'LATE_IN_PROGRESS'];
export function isUnfinishedExec(execStatus: string | null | undefined): boolean {
  return !!execStatus && (TRACKING_TRIGGER_EXEC as readonly string[]).includes(execStatus);
}

/** 列管狀態:追蹤中 / 已完成(認可結案)。 */
export const TRACKED_STATUSES = ['TRACKING', 'COMPLETED'] as const;
export type TrackedStatus = (typeof TRACKED_STATUSES)[number];
export const TRACKED_STATUS_LABELS: Record<TrackedStatus, string> = {
  TRACKING: '持續列管中',
  COMPLETED: '已完成結案',
};

/** 單筆回報的審核狀態(送出後由中心/協審委員裁決三態)。 */
export const TRACKED_REVIEW_STATUSES = ['PENDING', 'CONTINUE', 'COMPLETE', 'RETURNED'] as const;
export type TrackedReviewStatus = (typeof TRACKED_REVIEW_STATUSES)[number];
export const TRACKED_REVIEW_STATUS_LABELS: Record<TrackedReviewStatus, string> = {
  PENDING: '待審核',
  CONTINUE: '通過・續列管',
  COMPLETE: '認可完成',
  RETURNED: '退回補正',
};

/** 滾動審核決議(送出時的三選一;對應 TrackedReport.reviewStatus 的三個終態)。 */
export const TRACKED_REVIEW_DECISIONS = ['CONTINUE', 'COMPLETE', 'RETURN'] as const;
export type TrackedReviewDecision = (typeof TRACKED_REVIEW_DECISIONS)[number];

/** 回報週期(月)可選值:逐筆可調,預設 6 個月。 */
export const TRACKING_CADENCE_OPTIONS = [3, 6, 9, 12] as const;
export const DEFAULT_TRACKING_CADENCE = 6;

// ════════════════════════════════════════════
// 批A:事前場次調查
// ════════════════════════════════════════════

/** 受調人員類別:委員 / 觀察員(決定分表、cv 需求、達標分母)。 */
export const SURVEY_PARTICIPANT_KINDS = ['MEMBER', 'OBSERVER'] as const;
export type SurveyParticipantKind = (typeof SURVEY_PARTICIPANT_KINDS)[number];
export const SURVEY_PARTICIPANT_KIND_LABELS: Record<SurveyParticipantKind, string> = {
  MEMBER: '委員',
  OBSERVER: '觀察員',
};

/** 委員細分構面(觀察員不適用;可於管考表調整)。 */
export const SURVEY_COMMITTEE_TYPES = ['管理面', '策略面', '技術面', '管理面-OT'] as const;
export type SurveyCommitteeType = (typeof SURVEY_COMMITTEE_TYPES)[number];

/** 逐場次意願三態。 */
export const SURVEY_AVAILABILITY_STATUSES = ['OK', 'PENDING', 'NA'] as const;
export type SurveyAvailabilityStatus = (typeof SURVEY_AVAILABILITY_STATUSES)[number];
export const SURVEY_AVAILABILITY_LABELS: Record<SurveyAvailabilityStatus, string> = {
  OK: 'OK',
  PENDING: '待定',
  NA: 'N/A',
};

/** 意願回信(管考表欄位)。 */
export const SURVEY_REPLY_STATUSES = ['YES', 'NO'] as const;
export type SurveyReplyStatus = (typeof SURVEY_REPLY_STATUSES)[number];
export const SURVEY_REPLY_STATUS_LABELS: Record<SurveyReplyStatus, string> = {
  YES: '是',
  NO: '否',
};

/** 文件交接狀態(管考表欄位)。 */
export const SURVEY_DOC_HANDOVER_STATUSES = ['PENDING', 'WAITING', 'UPDATED'] as const;
export type SurveyDocHandover = (typeof SURVEY_DOC_HANDOVER_STATUSES)[number];
export const SURVEY_DOC_HANDOVER_LABELS: Record<SurveyDocHandover, string> = {
  PENDING: '未處理',
  WAITING: '等待回傳',
  UPDATED: '更新文件已上傳',
};

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

/**
 * 委員審閱時間區間閘(UAT 批67):中心設定的 reviewWindowStart/End 限制委員檢視機關資料
 * (資料準備 + 資通安全檢核表審閱)的時段。此為「階段閘之外的額外時間閘」,僅作用於委員(AUDITOR):
 *  - 未設區間(任一端為 null)→ 一律不開放(使用者裁定「沒設區間就不開放」,強制中心明確設定審閱時段);
 *  - 設了 → 僅在 [start, end] 內開放,未到不可看、已過不可看。
 * 中心/機關不受此限。與階段閘(auditorCanSeePrep / auditorCanViewChecklistContent)為「且」關係:兩者皆過才可見。
 */
export function auditorReviewWindowOpen(
  start: Date | string | null | undefined,
  end: Date | string | null | undefined,
  now: Date = new Date(),
): boolean {
  if (!start || !end) return false;
  const s = start instanceof Date ? start : new Date(start);
  const e = end instanceof Date ? end : new Date(end);
  if (Number.isNaN(s.getTime()) || Number.isNaN(e.getTime())) return false;
  return now.getTime() >= s.getTime() && now.getTime() <= e.getTime();
}

/** 實地稽核階段是否已結束(缺失發布起):委員審閱窗口的鎖定提示於此後改顯
 *  「實地稽核階段已結束,非審閱時段」——此時再提「中心尚未設定審閱時段」已不合情境(稽核已結束,無需再設)。 */
export function onsiteStageEnded(cycleStatus: string): boolean {
  return cycleStatus === 'REPORT_ISSUED' || cycleStatus === 'REMEDIATION' || cycleStatus === 'CLOSED';
}

/** 委員審閱窗口狀態(供 UI 顯示「尚未開始 / 已結束 / 未設定」的鎖定提示訊息)。 */
export type ReviewWindowState = 'open' | 'before' | 'after' | 'unset';
export function auditorReviewWindowState(
  start: Date | string | null | undefined,
  end: Date | string | null | undefined,
  now: Date = new Date(),
): ReviewWindowState {
  if (!start || !end) return 'unset';
  const s = start instanceof Date ? start : new Date(start);
  const e = end instanceof Date ? end : new Date(end);
  if (Number.isNaN(s.getTime()) || Number.isNaN(e.getTime())) return 'unset';
  if (now.getTime() < s.getTime()) return 'before';
  if (now.getTime() > e.getTime()) return 'after';
  return 'open';
}

/**
 * 觀察員獨立審閱窗口(批30):與委員窗口平行的第二組區間(AuditCycle.observerWindowStart/End),
 * 語義完全比照委員窗口(未設=不開放)。以下兩個 ForRole 包裝讓呼叫端「依角色取對的欄位」,
 * 避免觀察員誤走委員窗口。observerWindow* 為 optional:呼叫端 select 漏帶欄位時視同未設
 * (fail-closed,寧可鎖住也不誤開)。中心/機關不受窗口管制(回 open/true)。
 */
export type ReviewWindowFields = {
  reviewWindowStart: Date | string | null;
  reviewWindowEnd: Date | string | null;
  observerWindowStart?: Date | string | null;
  observerWindowEnd?: Date | string | null;
};

export function reviewWindowOpenForRole(role: Role, c: ReviewWindowFields, now: Date = new Date()): boolean {
  if (role === 'AUDITOR') return auditorReviewWindowOpen(c.reviewWindowStart, c.reviewWindowEnd, now);
  if (role === 'OBSERVER') return auditorReviewWindowOpen(c.observerWindowStart ?? null, c.observerWindowEnd ?? null, now);
  return true;
}

export function reviewWindowStateForRole(role: Role, c: ReviewWindowFields, now: Date = new Date()): ReviewWindowState {
  if (role === 'AUDITOR') return auditorReviewWindowState(c.reviewWindowStart, c.reviewWindowEnd, now);
  if (role === 'OBSERVER') return auditorReviewWindowState(c.observerWindowStart ?? null, c.observerWindowEnd ?? null, now);
  return 'open';
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
  'TRACKED_REPORT', // 批71:持續列管缺失之滾動回報佐證
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
