import { prisma } from './db';

/** 稽核前資料準備標準清單(P2 簡化版範本;PrepTemplate 完整管理留待後續)。
 *  prep 路由「套用標準清單」與批次開立精靈共用。 */
export const STANDARD_PREP_ITEMS: { title: string; description: string }[] = [
  { title: '資通安全實地稽核檢核表', description: '依當年度教育部公告版本填妥之檢核表(Excel/ODT)' },
  { title: '資通安全維護計畫', description: '最新核定版本' },
  { title: '資通安全維護計畫實施情形', description: '上年度實施情形報告' },
  { title: 'ISMS 驗證證書', description: 'CNS 27001 / ISO 27001 證書影本(含 TAF 認證標誌)' },
  { title: '資訊資產清冊', description: '含核心資通系統標示與防護需求分級' },
  { title: '上年度稽核改善報告', description: '若為首次受稽免附' },
];

/**
 * 確保週期具備標準資料準備需求清單(冪等:已存在同標題者略過,並各建一筆空 submission)。
 * 供「套用標準清單」按鈕、與「轉入 PREPARATION 自動套用」共用,回傳新建項目數。
 */
export async function ensureStandardPrepItems(cycleId: string): Promise<number> {
  const agg = await prisma.prepRequirement.aggregate({
    where: { cycleId },
    _max: { orderIndex: true },
  });
  let order = (agg._max.orderIndex ?? -1) + 1;
  let created = 0;
  for (const item of STANDARD_PREP_ITEMS) {
    const dup = await prisma.prepRequirement.findFirst({ where: { cycleId, title: item.title } });
    if (dup) continue;
    await prisma.prepRequirement.create({
      data: {
        cycleId,
        title: item.title,
        description: item.description,
        orderIndex: order++,
        submission: { create: {} },
      },
    });
    created++;
  }
  return created;
}
