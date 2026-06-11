/**
 * 稽核報告彙整工具 — 純邏輯層(無 React 相依)。
 * 由單檔工具「稽核報告彙整工具_進階版15.html」移植;
 * 編號排序/格式檢查/統計分析都在這裡,方便單測與後續優化。
 */

export type Category = 'strategy' | 'management' | 'technical';
export type SectionKey = 'compliance' | 'improvements' | 'suggestions';

export const CATEGORIES: Category[] = ['strategy', 'management', 'technical'];
export const SECTIONS: SectionKey[] = ['compliance', 'improvements', 'suggestions'];

export type Finding = {
  id: string;
  code: string;
  text: string;
  pageBreakBefore: boolean;
  duplicateAcknowledged: boolean;
};

export type AuditCriterion = { id: string; text: string };

export type SectionPageBreak = { pageBreakBefore: boolean };
export type CategorySettings = {
  pageBreakBefore: boolean;
  compliance: SectionPageBreak;
  improvements: SectionPageBreak;
  suggestions: SectionPageBreak;
};

export type ReportData = {
  year: string;
  hospitalName: string;
  branchName: string;
  auditDateRaw: string;
  scope: string;
  auditCriteria: AuditCriterion[];
  lead: { name: string; title: string };
  subLead: { name: string; title: string; org: string };
  team: Record<Category, string[]>;
  findings: Record<Category, Record<SectionKey, Finding[]>>;
  sectionSettings: Record<Category, CategorySettings>;
};

// ═══ 固定資料 ═══

export const PREDEFINED_SNIPPETS = [
  '依資通安全管理法施行細則第6條規定',
  '依資通安全責任等級分級辦法應辦事項規定',
  '依資通安全責任等級分級辦法資通系統防護基準規定',
  '依資通安全事件通報及應變辦法第9條規定',
  '依資通安全管理法第9條規定',
  '依資通安全責任等級分級辦法第11條規定',
  '依資通安全管理法施行細則第4條規定',
  '依衛生福利部醫療領域資通系統資安防護基準附表一規定',
  '（IT、OT類）',
];

export const HOSPITALS = [
  '國立臺灣大學醫學院附設醫院',
  '國立臺灣大學醫學院附設醫院 癌醫中心分院',
  '國立臺灣大學醫學院附設醫院 北護分院',
  '國立臺灣大學醫學院附設醫院 金山分院',
  '國立臺灣大學醫學院附設醫院 新竹臺大分院',
  '國立臺灣大學醫學院附設醫院 雲林分院',
  '國立成功大學醫學院附設醫院',
  '國立成功大學醫學院附設醫院 斗六分院',
  '國立陽明交通大學附設醫院',
];

export function makeDefaultReportData(): ReportData {
  return {
    year: '115',
    hospitalName: HOSPITALS[0],
    branchName: '',
    auditDateRaw: '',
    scope: '資通安全維護計畫所包括之全機關。',
    auditCriteria: [
      { id: 'ac1', text: '資通安全管理法及其子法' },
      { id: 'ac2', text: '國家資通安全發展方案（114年至117年）' },
      { id: 'ac3', text: '資訊安全管理系統國家標準CNS 27001：2023' },
      { id: 'ac4', text: '國際資訊安全管理標準ISO 27001：2013、ISO 27001：2022' },
      { id: 'ac5', text: '服務管理系統國際標準ISO 20000-1：2018' },
      { id: 'ac6', text: '受稽機關之資通安全維護計畫' },
      { id: 'ac7', text: '其他適用之行政院、衛福部或本部資通安全政策或規範' },
    ],
    lead: { name: '○○○', title: '高級分析師' },
    subLead: { name: '○○○', title: '組長', org: '國立○○大學醫學院附設醫院' },
    team: {
      strategy: ['○○○'],
      management: ['○○○', '○○○', '○○○'],
      technical: ['○○○', '○○○'],
    },
    findings: {
      strategy: { compliance: [], improvements: [], suggestions: [] },
      management: { compliance: [], improvements: [], suggestions: [] },
      technical: { compliance: [], improvements: [], suggestions: [] },
    },
    sectionSettings: {
      strategy: { pageBreakBefore: false, compliance: { pageBreakBefore: false }, improvements: { pageBreakBefore: false }, suggestions: { pageBreakBefore: false } },
      management: { pageBreakBefore: false, compliance: { pageBreakBefore: false }, improvements: { pageBreakBefore: false }, suggestions: { pageBreakBefore: false } },
      technical: { pageBreakBefore: false, compliance: { pageBreakBefore: false }, improvements: { pageBreakBefore: false }, suggestions: { pageBreakBefore: false } },
    },
  };
}

// ═══ 本機暫存 ═══

export const STORAGE_KEY = 'auditToolData';

/** 從 localStorage 載入並補齊舊版資料缺欄位(沿用原工具的遷移邏輯)。 */
export function loadStoredReportData(storageKey: string = STORAGE_KEY): ReportData | null {
  try {
    const raw = localStorage.getItem(storageKey);
    if (!raw) return null;
    return sanitizeImported(JSON.parse(raw));
  } catch {
    return null;
  }
}

/** 匯入(或讀檔)資料的防呆補齊;格式不符回傳 null。 */
export function sanitizeImported(parsed: unknown): ReportData | null {
  const p = parsed as ReportData | null;
  if (!p || typeof p !== 'object' || !p.findings) return null;
  const def = makeDefaultReportData();
  if (!p.sectionSettings) p.sectionSettings = def.sectionSettings;
  if (!p.auditCriteria) p.auditCriteria = def.auditCriteria;
  for (const cat of CATEGORIES) {
    if (!p.sectionSettings[cat]) p.sectionSettings[cat] = def.sectionSettings[cat];
    if (p.sectionSettings[cat].pageBreakBefore === undefined) {
      p.sectionSettings[cat].pageBreakBefore = false;
    }
    for (const sec of SECTIONS) {
      p.findings[cat][sec] = (p.findings[cat][sec] ?? []).map((f) => ({
        ...f,
        duplicateAcknowledged: f.duplicateAcknowledged || false,
      }));
    }
  }
  return p;
}

// ═══ 文字工具 ═══

/** 智慧標點轉換:保留 IP/網址/版本號中的半形句號。 */
export function toFullWidth(str: string): string {
  const map: Record<string, string> = {
    ',': '，', ':': '：', ';': '；',
    '!': '！', '?': '？', '(': '（', ')': '）',
  };
  return str.replace(/([,.:;!?()])/g, (match, _p1, offset, s: string) => {
    if (match === '.') {
      const prevChar = s[offset - 1];
      if (prevChar && /[0-9a-zA-Z]/.test(prevChar)) return '.';
      return '。';
    }
    return map[match] ?? match;
  });
}

export function toROCDate(dateStr: string, defaultYear: string): string {
  if (!dateStr) return `${defaultYear}年○月○日`;
  const date = new Date(dateStr);
  const year = date.getFullYear() - 1911;
  return `${year}年${date.getMonth() + 1}月${date.getDate()}日`;
}

// ═══ 項次編號:解析/排序/檢查 ═══

export type NormalizedCode = { isOT: boolean; numStr: string; normalized: string };

export function normalizeCodes(rawCode: string | null | undefined): NormalizedCode[] {
  if (!rawCode) return [];
  const isGlobalOT = String(rawCode).trim().toUpperCase().startsWith('OT-');
  return String(rawCode)
    .split(/[、,，\s]+/)
    .map((s) => s.trim())
    .filter((s) => s !== '')
    .map((seg) => {
      const hasOTPrefix = seg.toUpperCase().startsWith('OT-');
      const isOT = isGlobalOT || hasOTPrefix;
      const numStr = hasOTPrefix ? seg.substring(3) : seg;
      return { isOT, numStr, normalized: isOT ? `OT-${numStr}` : numStr };
    });
}

/** 階層式版本比對(5.2 < 5.12 正確排序;OT- 系列排最後)。 */
export function compareNormalized(a: NormalizedCode, b: NormalizedCode): number {
  if (a.isOT !== b.isOT) return a.isOT ? 1 : -1;
  const v1 = a.numStr.split('.').map((p) => parseInt(p, 10) || 0);
  const v2 = b.numStr.split('.').map((p) => parseInt(p, 10) || 0);
  const len = Math.max(v1.length, v2.length);
  for (let i = 0; i < len; i++) {
    const n1 = v1[i] !== undefined ? v1[i] : -1;
    const n2 = v2[i] !== undefined ? v2[i] : -1;
    if (n1 !== n2) return n1 - n2;
  }
  return a.numStr.localeCompare(b.numStr);
}

export function compareCodesFull(aRaw: string, bRaw: string): number {
  if (!aRaw && !bRaw) return 0;
  if (!aRaw) return 1;
  if (!bRaw) return -1;
  const codesA = normalizeCodes(aRaw);
  const codesB = normalizeCodes(bRaw);
  const len = Math.max(codesA.length, codesB.length);
  for (let i = 0; i < len; i++) {
    const cA = codesA[i];
    const cB = codesB[i];
    if (!cA) return -1;
    if (!cB) return 1;
    const comp = compareNormalized(cA, cB);
    if (comp !== 0) return comp;
  }
  return 0;
}

/** 編號格式即時防呆(回傳錯誤訊息或 null)。 */
export function findingFormatError(code: string): string | null {
  if (!code) return null;
  if (/[ ,]/.test(code)) return '請用「、」分隔';
  if (/[、,，]{2,}/.test(code)) return '連續的分隔符號';
  const codes = normalizeCodes(code);
  for (const c of codes) {
    if ((c.numStr.match(/\./g) || []).length > 1) return '缺少「、」分隔';
  }
  const normalizedStrings = codes.map((c) => c.normalized);
  if (new Set(normalizedStrings).size !== normalizedStrings.length) return '單項編號重複';
  for (let i = 0; i < codes.length - 1; i++) {
    if (compareNormalized(codes[i], codes[i + 1]) > 0) return '未由小到大排序';
  }
  return null;
}

/** 依編號排序;同編號維持原相對順序(穩定)。 */
export function sortFindings(list: Finding[]): Finding[] {
  const withIndex = list.map((item, index) => ({ ...item, _originalIndex: index }));
  return withIndex
    .sort((a, b) => {
      const comp = compareCodesFull(a.code, b.code);
      if (comp === 0) return a._originalIndex - b._originalIndex;
      return comp;
    })
    .map(({ _originalIndex: _x, ...rest }) => rest);
}

// ═══ 統計分析(數據總覽頁) ═══

export type CatCounts = { c: number; i: number; s: number };
export type CodeStat = { i: number; s: number; total: number };
export type Subset = { items: string[]; count: number };
export type AssociationRule = { premise: string; consequence: string; coCount: number; confidence: number };

export type ToolStats = {
  strategy: CatCounts;
  management: CatCounts;
  technical: CatCounts;
  totalC: number;
  totalI: number;
  totalS: number;
  total: number;
  codeMap: Record<string, CodeStat>;
  sortedCodes: string[];
  nonRedundantSubsets: Subset[];
  associationRules: AssociationRule[];
};

export function computeStats(reportData: ReportData): ToolStats {
  const stats: ToolStats = {
    strategy: { c: 0, i: 0, s: 0 },
    management: { c: 0, i: 0, s: 0 },
    technical: { c: 0, i: 0, s: 0 },
    totalC: 0, totalI: 0, totalS: 0, total: 0,
    codeMap: {}, sortedCodes: [], nonRedundantSubsets: [], associationRules: [],
  };
  const subsetMap: Record<string, number> = {};
  const coOccurrenceMap: Record<string, number> = {};

  for (const cat of CATEGORIES) {
    for (const sec of SECTIONS) {
      const secKey = sec === 'compliance' ? 'c' : sec === 'improvements' ? 'i' : 's';
      const items = reportData.findings[cat][sec].filter((f) => f.text.trim());
      stats[cat][secKey as keyof CatCounts] = items.length;
      if (secKey === 'c') stats.totalC += items.length;
      else if (secKey === 'i') stats.totalI += items.length;
      else stats.totalS += items.length;
      stats.total += items.length;

      if (secKey === 'i' || secKey === 's') {
        for (const item of items) {
          if (!item.code) continue;
          const codes = Array.from(new Set(normalizeCodes(item.code).map((c) => c.normalized)));

          for (const c of codes) {
            if (!stats.codeMap[c]) stats.codeMap[c] = { i: 0, s: 0, total: 0 };
            stats.codeMap[c][secKey as 'i' | 's'] += 1;
            stats.codeMap[c].total += 1;
          }

          if (codes.length > 1) {
            const sortedSubset = [...codes].sort(compareCodesFull);
            const combs: string[][] = [];
            const walk = (prefix: string[], rest: string[]) => {
              for (let i = 0; i < rest.length; i++) {
                const next = [...prefix, rest[i]];
                if (next.length >= 2) combs.push(next);
                walk(next, rest.slice(i + 1));
              }
            };
            walk([], sortedSubset);
            for (const comb of combs) {
              const key = comb.join('|');
              subsetMap[key] = (subsetMap[key] || 0) + 1;
              if (comb.length === 2) coOccurrenceMap[key] = (coOccurrenceMap[key] || 0) + 1;
            }
          }
        }
      }
    }
  }

  stats.sortedCodes = Object.keys(stats.codeMap).sort(compareCodesFull);

  const frequentSubsets: Subset[] = Object.keys(subsetMap)
    .map((key) => ({ items: key.split('|'), count: subsetMap[key] }))
    .filter((subset) => subset.count >= 2)
    .sort((a, b) => b.items.length - a.items.length || b.count - a.count);

  stats.nonRedundantSubsets = frequentSubsets
    .filter((subset) => {
      return !frequentSubsets.some((other) => {
        if (other.items.length <= subset.items.length) return false;
        const isSuperset = subset.items.every((item) => other.items.includes(item));
        return isSuperset && other.count === subset.count;
      });
    })
    .sort((a, b) => b.count - a.count || b.items.length - a.items.length);

  const rules: AssociationRule[] = [];
  for (const key of Object.keys(coOccurrenceMap)) {
    const [itemA, itemB] = key.split('|');
    const coCount = coOccurrenceMap[key];
    if (stats.codeMap[itemA] && stats.codeMap[itemA].total > 0) {
      rules.push({ premise: itemA, consequence: itemB, coCount, confidence: (coCount / stats.codeMap[itemA].total) * 100 });
    }
    if (stats.codeMap[itemB] && stats.codeMap[itemB].total > 0) {
      rules.push({ premise: itemB, consequence: itemA, coCount, confidence: (coCount / stats.codeMap[itemB].total) * 100 });
    }
  }
  stats.associationRules = rules
    .filter((r) => r.confidence >= 50 && r.coCount >= 2)
    .sort((a, b) => b.confidence - a.confidence || b.coCount - a.coCount);

  return stats;
}

/** 產出可貼進 Excel 的統計表文字。 */
export function buildStatsCopyText(type: 'itemCounts' | 'association', stats: ToolStats): string {
  let text = '';
  if (type === 'itemCounts') {
    text = '項次\t待改善事項\t建議事項\t總計\n';
    for (const code of stats.sortedCodes) {
      const stat = stats.codeMap[code];
      text += `${code}\t${stat.i}\t${stat.s}\t${stat.i + stat.s}\n`;
    }
  } else {
    if (stats.nonRedundantSubsets.length > 0) {
      text += '【完整複合組合】\n項次組合\t共同出現次數\n';
      for (const subset of stats.nonRedundantSubsets) {
        text += `${subset.items.join('、')}\t${subset.count}\n`;
      }
      text += '\n';
    }
    if (stats.associationRules.length > 0) {
      text += '【雙項次關聯強度】\n前提項次\t伴隨項次\t共同次數\t伴隨機率\n';
      for (const rule of stats.associationRules) {
        text += `${rule.premise}\t${rule.consequence}\t${rule.coCount}\t${rule.confidence.toFixed(0)}%\n`;
      }
    }
  }
  return text;
}
