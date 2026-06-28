import { prisma } from './db';

/**
 * 歷年同類缺失追蹤(批次③ topPick #1)。
 *
 * 把「一次性稽核」升級為「持續改善管考平台」的核心:同一機關、同一檢核項(或同構面)
 * 跨年度重複出現的缺失,讓機關不敢敷衍、委員有籌碼、中心可政策介入。
 *
 * 全部為唯讀聚合查詢,無 schema 變更。
 * 租戶隔離:findRepeat* 一律以 organizationId 過濾,呼叫端傳入已通過存取檢查之機關 id,
 * 不可能跨機關洩漏;findRepeatOffenders 限 SUPER_ADMIN(中心)使用。
 *
 * 「同類」判定:有檢核項參照(checklistRef)時以該項為準(最精確);無參照時退而求其次以構面(aspect)歸併。
 */

export type DeficiencyHistoryEntry = {
  deficiencyId: string;
  year: number; // 西元
  yearROC: number; // 民國
  cycleId: string;
  aspect: string;
  type: string;
  itemNo: number;
  checklistRef: string | null;
  description: string;
  action: {
    status: string;
    rootCause: string | null;
    measureStrategy: string | null;
    measureManagement: string | null;
    measureTechnical: string | null;
    execStatus: string | null;
    plannedDate: string | null; // ISO
    actualDate: string | null; // ISO
  } | null;
};

/**
 * 缺失內頁歷史側欄用:找出「同機關、往年、同檢核項(或同構面)」的缺失供參。
 * @param beforeYear 只取早於此西元年的週期(通常是本週期年度),不含本年。
 * @param lookbackYears 回溯年數(預設 3 年)。
 */
export async function findRepeatDeficiencies(args: {
  organizationId: string;
  aspect: string;
  type: string;
  checklistRef: string | null;
  beforeYear: number;
  lookbackYears?: number;
  excludeDeficiencyId?: string;
}): Promise<DeficiencyHistoryEntry[]> {
  const { organizationId, aspect, type, beforeYear } = args;
  const lookbackYears = args.lookbackYears ?? 3;
  const checklistRef = args.checklistRef?.trim() || null;

  // 同類判定:有檢核項參照用 checklistRef,否則退回同構面 + 同類型
  const sameLike = checklistRef
    ? { checklistRef }
    : { aspect, type };

  const rows = await prisma.deficiency.findMany({
    where: {
      ...(args.excludeDeficiencyId ? { id: { not: args.excludeDeficiencyId } } : {}),
      ...sameLike,
      cycle: {
        organizationId, // 租戶隔離:僅同機關
        year: { lt: beforeYear, gte: beforeYear - lookbackYears },
      },
    },
    include: {
      cycle: { select: { id: true, year: true } },
      action: true,
    },
    orderBy: [{ cycle: { year: 'desc' } }, { aspect: 'asc' }, { itemNo: 'asc' }],
  });

  return rows.map((d) => ({
    deficiencyId: d.id,
    year: d.cycle.year,
    yearROC: d.cycle.year - 1911,
    cycleId: d.cycle.id,
    aspect: d.aspect,
    type: d.type,
    itemNo: d.itemNo,
    checklistRef: d.checklistRef,
    description: d.description,
    action: d.action
      ? {
          status: d.action.status,
          rootCause: d.action.rootCause,
          measureStrategy: d.action.measureStrategy,
          measureManagement: d.action.measureManagement,
          measureTechnical: d.action.measureTechnical,
          execStatus: d.action.execStatus,
          plannedDate: d.action.plannedDate?.toISOString() ?? null,
          actualDate: d.action.actualDate?.toISOString() ?? null,
        }
      : null,
  }));
}

export type RepeatOffender = {
  organizationId: string;
  organizationName: string;
  /** 歸併鍵的可讀標籤:檢核項 9.10 或 構面名 */
  groupLabel: string;
  groupKind: 'ref' | 'aspect';
  aspect: string;
  checklistRef: string | null;
  firstYearROC: number;
  lastYearROC: number;
  occurrenceCount: number; // 出現的不同年度數
  occurrences: { yearROC: number; type: string; itemNo: number; status: string }[];
};

/**
 * 中心端 repeat-offender 彙整:跨全機關找出「同機關 × 同檢核項(或同構面)在 ≥2 個不同年度重複」者。
 * 系統性政策介入的依據。限 SUPER_ADMIN 呼叫。
 * @param year 若給定(西元年),回溯至該年度為止(只計入 ≤ year 的週期);不給則全部年度。
 */
export async function findRepeatOffenders(opts?: {
  organizationId?: string;
  maxYear?: number;
}): Promise<RepeatOffender[]> {
  const rows = await prisma.deficiency.findMany({
    where: {
      cycle: {
        ...(opts?.organizationId ? { organizationId: opts.organizationId } : {}),
        ...(opts?.maxYear ? { year: { lte: opts.maxYear } } : {}),
      },
    },
    include: {
      cycle: { select: { year: true, organizationId: true, organization: { select: { name: true } } } },
      action: { select: { status: true } },
    },
  });

  // 歸併鍵:org + (檢核項 or 構面)。null-safe:無 checklistRef 退回構面。
  type Acc = {
    organizationId: string;
    organizationName: string;
    groupKind: 'ref' | 'aspect';
    aspect: string;
    checklistRef: string | null;
    years: Map<number, { type: string; itemNo: number; status: string }>;
  };
  const map = new Map<string, Acc>();

  for (const d of rows) {
    const ref = d.checklistRef?.trim() || null;
    const groupKind: 'ref' | 'aspect' = ref ? 'ref' : 'aspect';
    const key = `${d.cycle.organizationId}::${groupKind === 'ref' ? `ref:${ref}` : `aspect:${d.aspect}`}`;
    let acc = map.get(key);
    if (!acc) {
      acc = {
        organizationId: d.cycle.organizationId,
        organizationName: d.cycle.organization.name,
        groupKind,
        aspect: d.aspect,
        checklistRef: ref,
        years: new Map(),
      };
      map.set(key, acc);
    }
    // 同年度多筆只留一筆代表(以重複「年度數」為累犯指標)
    if (!acc.years.has(d.cycle.year)) {
      acc.years.set(d.cycle.year, {
        type: d.type,
        itemNo: d.itemNo,
        status: d.action?.status ?? 'PENDING',
      });
    }
  }

  const result: RepeatOffender[] = [];
  for (const acc of map.values()) {
    if (acc.years.size < 2) continue; // 只保留跨 ≥2 個年度的累犯
    const yearsSorted = [...acc.years.keys()].sort((a, b) => a - b);
    result.push({
      organizationId: acc.organizationId,
      organizationName: acc.organizationName,
      groupLabel: acc.groupKind === 'ref' ? `檢核項 ${acc.checklistRef}` : asAspectLabel(acc.aspect),
      groupKind: acc.groupKind,
      aspect: acc.aspect,
      checklistRef: acc.checklistRef,
      firstYearROC: yearsSorted[0] - 1911,
      lastYearROC: yearsSorted[yearsSorted.length - 1] - 1911,
      occurrenceCount: acc.years.size,
      occurrences: yearsSorted.map((y) => ({ yearROC: y - 1911, ...acc.years.get(y)! })),
    });
  }
  // 累犯年度數多者優先,其次最近一次年度
  result.sort((a, b) => b.occurrenceCount - a.occurrenceCount || b.lastYearROC - a.lastYearROC);
  return result;
}

// 構面代碼 → 中文(與 lib/types.ts 對齊;此處內聯避免循環相依)
function asAspectLabel(aspect: string): string {
  switch (aspect) {
    case 'STRATEGY':
      return '策略面';
    case 'MANAGEMENT':
      return '管理面';
    case 'TECHNICAL':
      return '技術面';
    default:
      return aspect;
  }
}
