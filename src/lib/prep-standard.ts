import { prisma } from './db';

export type StdPrepItem = { title: string; description: string; category: string; required?: boolean };

/** 內建預設清單(全域模板為空時的後備;含三區:技術檢測 / 實地稽核 / 中心匯入)。 */
export const STANDARD_PREP_ITEMS: StdPrepItem[] = [
  // 實地稽核(機關上傳之文件)
  { title: '資通安全實地稽核檢核表', description: '依當年度教育部公告版本填妥之檢核表(Excel/ODT)', category: 'ONSITE' },
  { title: '資通安全維護計畫', description: '最新核定版本', category: 'ONSITE' },
  { title: '資通安全維護計畫實施情形', description: '上年度實施情形報告', category: 'ONSITE' },
  { title: 'ISMS 驗證證書', description: 'CNS 27001 / ISO 27001 證書影本(含 TAF 認證標誌)', category: 'ONSITE' },
  { title: '資訊資產清冊', description: '含核心資通系統標示與防護需求分級', category: 'ONSITE' },
  { title: '上年度稽核改善報告', description: '若為首次受稽免附', category: 'ONSITE' },
  // 技術檢測(機關上傳,常與實地稽核不同繳交期限)
  { title: '弱點掃描報告', description: '當年度系統弱點掃描結果與修補情形', category: 'TECH' },
  { title: '滲透測試報告', description: '對外服務系統滲透測試結果與修補情形', category: 'TECH' },
  // 中心匯入(由中心上傳,供委員審閱)
  { title: '社交工程演練結果', description: '由中心提供之社交工程演練統計與結果', category: 'CENTER' },
  { title: '資安事件通報紀錄', description: '由中心提供之本年度資安事件通報與處理紀錄', category: 'CENTER' },
];

/**
 * 取得標準清單(年度化):取「通用(year=null)+ 該週期年度(year=cycleYear)」項目,
 * 年度項與通用項同標題時年度項優先(逐年覆寫);模板全空則用內建預設。
 */
export async function getStandardItems(cycleYear: number): Promise<StdPrepItem[]> {
  const tpl = await prisma.prepTemplateItem.findMany({
    where: { OR: [{ year: null }, { year: cycleYear }] },
    orderBy: { orderIndex: 'asc' },
  });
  if (tpl.length === 0) return STANDARD_PREP_ITEMS;
  // 年度同名優先:先放年度項,再放未被同標題覆蓋的通用項(維持 orderIndex 相對順序)
  const yearly = tpl.filter((t) => t.year === cycleYear);
  const yearlyTitles = new Set(yearly.map((t) => t.title));
  const generic = tpl.filter((t) => t.year == null && !yearlyTitles.has(t.title));
  return [...yearly, ...generic].map((t) => ({
    title: t.title,
    description: t.description ?? '',
    category: t.category,
    required: t.required,
  }));
}

/**
 * 確保週期具備標準資料準備需求清單(冪等:已存在同標題者略過,並各建一筆空 submission)。
 * 供「套用標準清單」按鈕、與「轉入 PREPARATION 自動套用」共用;清單來源為全域模板(可由中心增刪,年度化)。
 */
export async function ensureStandardPrepItems(cycleId: string, cycleYear: number): Promise<number> {
  const agg = await prisma.prepRequirement.aggregate({
    where: { cycleId },
    _max: { orderIndex: true },
  });
  let order = (agg._max.orderIndex ?? -1) + 1;
  let created = 0;
  const items = await getStandardItems(cycleYear);
  for (const item of items) {
    const dup = await prisma.prepRequirement.findFirst({ where: { cycleId, title: item.title } });
    if (dup) continue;
    await prisma.prepRequirement.create({
      data: {
        cycleId,
        title: item.title,
        description: item.description || null,
        category: item.category,
        required: item.required ?? true,
        orderIndex: order++,
        submission: { create: {} },
      },
    });
    created++;
  }
  return created;
}
