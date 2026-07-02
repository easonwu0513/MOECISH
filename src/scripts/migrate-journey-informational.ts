/**
 * 一次性冪等遷移:JourneyItem 新增 informational 欄位後,把「CYCLE 範疇、無 autoKey」的
 * **九個既有提醒項(標題白名單)**標為純提醒(informational=true),保留原行為
 * (舊邏輯:無 autoKey = 純提醒)。PROGRAMME 項目不動(維持手動勾選)。
 *
 * ⚠️ 只處理下列白名單標題——編輯器上線後「autoKey 空 + informational=false」也是
 * 管理員刻意設定的「必做・手動勾選」態,不可整批翻轉(2026-07 批56 審查 confirmed);
 * 白名單化後本腳本才真正可安全重跑。
 *
 * 跑法:npx tsx src/scripts/migrate-journey-informational.ts(冪等,可重跑)
 */
import { prisma } from '../lib/db';

const LEGACY_REMINDER_TITLES = [
  '檢視已確認齊備之資料',
  '檢視資通安全檢核表',
  '依排定日期到場實地查核',
  '逐題檢視機關自評檢核表並留審閱註記',
  '填寫委員評分與稽核發現',
  '通知機關開始矯正',
  '檢視已發布之缺失內容',
  '退回項目補正後重新送審',
  '追蹤各機關填報進度、寄送追蹤信',
];

async function main() {
  const r = await prisma.journeyItem.updateMany({
    where: {
      autoKey: null,
      informational: false,
      title: { in: LEGACY_REMINDER_TITLES },
      stage: { template: { scope: 'CYCLE' } },
    },
    data: { informational: true },
  });
  console.log(`[migrate] CYCLE 既有提醒項 → 純提醒:更新 ${r.count} 筆(0=已遷移過或無資料)。`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
