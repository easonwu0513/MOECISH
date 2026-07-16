/**
 * 一次性冪等遷移(UAT 批70):資料準備標準清單廢除「通用(year=null)」概念——
 * 使用者裁定:沒有通用版本,每一年的文件=先代入上一年度再小幅修正;改今年不可動到歷年(留存紀錄)。
 * 本腳本把現存「通用」項目就地改為「執行當年」的年度專屬項(保留 id → 範本檔 PrepTemplateFile FK 不動)。
 *
 * 跑法:npx tsx src/scripts/migrate-prep-generic-to-year.ts
 * 冪等:重跑時已無 year=null 項 → no-op。新版 UI 不再產生 year=null 項(新增一律綁今年)。
 * 邊界:若今年已存在同標題年度項(先前手動建的年度覆寫),為避免撞出兩筆同名年度項,
 *       該通用項跳過並列出(請人工確認後刪除通用項——年度項已覆寫它,語意不變)。
 */
import { prisma } from '../lib/db';

async function main() {
  const year = new Date().getFullYear();
  const generic = await prisma.prepTemplateItem.findMany({
    where: { year: null },
    orderBy: { orderIndex: 'asc' },
    select: { id: true, title: true, templateId: true },
  });
  if (generic.length === 0) {
    console.log('[migrate] 已無通用(year=null)項目,無事可做。');
    return;
  }
  const yearly = await prisma.prepTemplateItem.findMany({
    where: { year },
    select: { title: true },
  });
  const yearlyTitles = new Set(yearly.map((y) => y.title));

  let moved = 0;
  const skipped: string[] = [];
  for (const g of generic) {
    if (yearlyTitles.has(g.title)) {
      skipped.push(g.title); // 今年已有同名年度覆寫:不動,避免兩筆同名年度項
      continue;
    }
    await prisma.prepTemplateItem.update({ where: { id: g.id }, data: { year } });
    moved++;
  }
  console.log(`[migrate] 通用 → ${year}(民國 ${year - 1911})年度:改寫 ${moved} 項、跳過 ${skipped.length} 項。`);
  if (skipped.length) {
    console.log('[migrate] 跳過(今年已有同名年度項,通用項保留待人工確認刪除):');
    for (const t of skipped) console.log(`  - ${t}`);
  }
}

main()
  .then(() => prisma.$disconnect())
  .catch((e) => {
    console.error(e);
    return prisma.$disconnect().then(() => process.exit(1));
  });
