/**
 * 實地稽核評分表(附件17)核心邏輯:
 * 九個稽核項目 = 檢核表九構面;策略/管理/技術三面分組;滿分 100。
 */
import type { DeficiencyAspect, Dimension } from './types';

/** 各稽核項目配分(七、防護及控制措施 20 分,其餘 10 分) */
export const DIMENSION_MAX_SCORE: Record<Dimension, number> = {
  CORE_BUSINESS: 10,
  POLICY_ORG: 10,
  STAFFING_BUDGET: 10,
  ASSET_RISK: 10,
  OUTSOURCING: 10,
  MAINTENANCE_KPI: 10,
  PROTECTION_CONTROL: 20,
  SYSTEM_DEV: 10,
  INCIDENT_RESPONSE: 10,
};

/** 稽核構面 → 稽核項目(附件17 分組:一二三策略、四五六管理、七八九技術) */
export const ASPECT_DIMENSIONS: Record<DeficiencyAspect, Dimension[]> = {
  STRATEGY: ['CORE_BUSINESS', 'POLICY_ORG', 'STAFFING_BUDGET'],
  MANAGEMENT: ['ASSET_RISK', 'OUTSOURCING', 'MAINTENANCE_KPI'],
  TECHNICAL: ['PROTECTION_CONTROL', 'SYSTEM_DEV', 'INCIDENT_RESPONSE'],
};

/**
 * 委員指派負責構面(三構面四類):純指派標籤,用於指派時標記 + 評分頁聚焦,
 * 不更動附件17 的 9 項評分結構。管理面(OT)併入管理面群組做聚焦。
 */
export const ASSIGN_ASPECTS = ['STRATEGY', 'MANAGEMENT', 'MANAGEMENT_OT', 'TECHNICAL'] as const;
export type AssignAspect = (typeof ASSIGN_ASPECTS)[number];

export const ASSIGN_ASPECT_LABELS: Record<AssignAspect, string> = {
  STRATEGY: '策略面',
  MANAGEMENT: '管理面',
  MANAGEMENT_OT: '管理面(OT)',
  TECHNICAL: '技術面',
};

/** 指派構面(4 類)→ 評分構面(3 aspect):OT 併入管理面,供評分頁聚焦對應 9 項群組 */
export const ASSIGN_TO_ASPECT: Record<AssignAspect, DeficiencyAspect> = {
  STRATEGY: 'STRATEGY',
  MANAGEMENT: 'MANAGEMENT',
  MANAGEMENT_OT: 'MANAGEMENT',
  TECHNICAL: 'TECHNICAL',
};

/** 解析 AuditorAssignment.dimensions(JSON 字串)為有效的 AssignAspect 陣列 */
export function parseAssignDimensions(raw: string | null | undefined): AssignAspect[] {
  if (!raw) return [];
  try {
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return [];
    return arr.filter((x): x is AssignAspect => (ASSIGN_ASPECTS as readonly string[]).includes(x));
  } catch {
    return [];
  }
}

export const DIMENSION_NUM: Record<Dimension, string> = {
  CORE_BUSINESS: '一',
  POLICY_ORG: '二',
  STAFFING_BUDGET: '三',
  ASSET_RISK: '四',
  OUTSOURCING: '五',
  MAINTENANCE_KPI: '六',
  PROTECTION_CONTROL: '七',
  SYSTEM_DEV: '八',
  INCIDENT_RESPONSE: '九',
};

export type Grade = '優' | '良' | '佳' | '可' | '待改進';

/** 等第:20 分制 優20-17/良16-13/佳12-9/可8/待改進≤7;10 分制 優10-9/良8-7/佳6-5/可4/待改進≤3 */
export function gradeOf(dimension: Dimension, score: number): Grade {
  if (DIMENSION_MAX_SCORE[dimension] === 20) {
    if (score >= 17) return '優';
    if (score >= 13) return '良';
    if (score >= 9) return '佳';
    if (score === 8) return '可';
    return '待改進';
  }
  if (score >= 9) return '優';
  if (score >= 7) return '良';
  if (score >= 5) return '佳';
  if (score === 4) return '可';
  return '待改進';
}

/** 等第說明字串(顯示於評分輸入旁) */
export function gradeHint(dimension: Dimension): string {
  return DIMENSION_MAX_SCORE[dimension] === 20
    ? '優(20-17)、良(16-13)、佳(12-9)、可(8)、待改進(7 以下)'
    : '優(10-9)、良(8-7)、佳(6-5)、可(4)、待改進(3 以下)';
}

export const GRADE_TONE: Record<Grade, 'success' | 'sage' | 'primary' | 'warning' | 'danger'> = {
  優: 'success',
  良: 'sage',
  佳: 'primary',
  可: 'warning',
  待改進: 'danger',
};

/** 稽核發現三類(附件17) */
export const FINDING_KINDS = ['COMPLIANCE', 'IMPROVE', 'SUGGEST'] as const;
export type FindingKind = (typeof FINDING_KINDS)[number];

export const FINDING_KIND_LABELS: Record<FindingKind, string> = {
  COMPLIANCE: '法遵符合情形',
  IMPROVE: '待改善事項',
  SUGGEST: '建議事項',
};

export const FINDING_KIND_HINTS: Record<FindingKind, string> = {
  COMPLIANCE: '符合且優於法規要求的良好實踐',
  IMPROVE: '未辦理或未有效執行法規要求事項,需改善',
  SUGGEST: '無法規要求但存有資安風險,建議改善',
};

/**
 * 稽核發現「對應項次」排序鍵:把 "2.5"、"9.10" 解析為數字序列做自然排序
 * (2.5 < 2.10 < 7.4);無項次或非數字者排最後。供發現清單與彙整報告/列印一致排序。
 */
export function checklistRefSortKey(ref: string | null | undefined): number[] {
  const t = (ref ?? '').trim();
  if (!t) return [Number.MAX_SAFE_INTEGER];
  const parts = t.split('.').map((p) => parseInt(p, 10));
  return parts.some((n) => Number.isNaN(n)) ? [Number.MAX_SAFE_INTEGER - 1] : parts;
}

export function compareChecklistRef(a: string | null | undefined, b: string | null | undefined): number {
  const ka = checklistRefSortKey(a);
  const kb = checklistRefSortKey(b);
  const len = Math.max(ka.length, kb.length);
  for (let i = 0; i < len; i++) {
    const d = (ka[i] ?? -1) - (kb[i] ?? -1);
    if (d !== 0) return d;
  }
  return 0;
}

export type DimStat = { total: number; c1: number; c2: number; c3: number; c4: number };

/** 由檢核表題目+機關作答計算各構面統計(評分表「檢核結果數量統計」自動帶入)。 */
export function computeDimStats(
  items: { id: string; dimension: string }[],
  responses: { checklistItemId: string; compliance: string | null }[],
): Record<string, DimStat> {
  const byItem = new Map(responses.map((r) => [r.checklistItemId, r.compliance]));
  const stats: Record<string, DimStat> = {};
  for (const item of items) {
    const s = (stats[item.dimension] ??= { total: 0, c1: 0, c2: 0, c3: 0, c4: 0 });
    s.total++;
    const c = byItem.get(item.id);
    if (c === 'COMPLIANT') s.c1++;
    else if (c === 'PARTIALLY_COMPLIANT') s.c2++;
    else if (c === 'NON_COMPLIANT') s.c3++;
    else if (c === 'NOT_APPLICABLE') s.c4++;
  }
  return stats;
}
