/**
 * 資料保留政策(純常數 + 計算函數;無副作用、無 schema 變更、不執行任何封存或刪除)。
 *
 * 檔案法 / 資通安全相關規定:稽核紀錄、佐證類資料應保存 ≥5 年。
 * 本檔僅作為保留政策的「單一事實來源」與到期計算函數,供日後的封存/清理機制
 * (需明確同意後另案實作、且預設停用、且以軟封存而非硬刪除)引用。
 * 現階段系統不依此自動清理任何資料。
 */

export type RetentionCategory = 'AUDIT_RECORDS' | 'EVIDENCE' | 'TRANSIENT' | 'ACCOUNT';

/** 各類別保留年限(年) */
export const RETENTION_YEARS: Record<RetentionCategory, number> = {
  AUDIT_RECORDS: 7, // 稽核軌跡/缺失/矯正/週期:法定 ≥5 年,從嚴採 7 年
  EVIDENCE: 5, // 佐證附件、簽核報告:5 年
  TRANSIENT: 3, // 通知信等暫時性紀錄:3 年
  ACCOUNT: 1, // 未使用邀請等帳號殘留:1 年
};

export const RETENTION_CATEGORY_LABELS: Record<RetentionCategory, string> = {
  AUDIT_RECORDS: '稽核紀錄(缺失/矯正/軌跡/週期)',
  EVIDENCE: '佐證附件與簽核報告',
  TRANSIENT: '通知信等暫時性紀錄',
  ACCOUNT: '邀請等帳號殘留資料',
};

/** 法遵硬下限(年):低於此值的政策設定不合法 */
export const RETENTION_LEGAL_MIN: Partial<Record<RetentionCategory, number>> = {
  AUDIT_RECORDS: 5,
  EVIDENCE: 5,
};

/** 實體類型 → 保留類別對照 */
const ENTITY_CATEGORY: Record<string, RetentionCategory> = {
  AuditLog: 'AUDIT_RECORDS',
  Deficiency: 'AUDIT_RECORDS',
  CorrectiveAction: 'AUDIT_RECORDS',
  AuditCycle: 'AUDIT_RECORDS',
  Evidence: 'EVIDENCE',
  SignedReport: 'EVIDENCE',
  EmailLog: 'TRANSIENT',
  Invitation: 'ACCOUNT',
};

export function getRetentionCategory(entityType: string): RetentionCategory | null {
  return ENTITY_CATEGORY[entityType] ?? null;
}

export function retentionYears(category: RetentionCategory): number {
  return RETENTION_YEARS[category];
}

/** 計算到期日(createdAt + 保留年限) */
export function calculateRetentionUntil(createdAt: Date, category: RetentionCategory): Date {
  const d = new Date(createdAt);
  d.setFullYear(d.getFullYear() + RETENTION_YEARS[category]);
  return d;
}

/** 是否已逾保留期(到期「可」封存;實際封存/清理機制尚未啟用) */
export function isPastRetention(createdAt: Date, category: RetentionCategory, now: Date = new Date()): boolean {
  return calculateRetentionUntil(createdAt, category).getTime() <= now.getTime();
}

/** 驗證設定的保留年限是否符合法定下限(供日後設定介面用) */
export function isPolicyLegal(category: RetentionCategory, years: number): boolean {
  const min = RETENTION_LEGAL_MIN[category];
  return min === undefined || years >= min;
}
