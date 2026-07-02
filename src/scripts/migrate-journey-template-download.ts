/**
 * 一次性冪等遷移:於 CYCLE 精靈「資料準備中(PREPARATION)」階段最前面插入
 * 「下載文件範本，依式填寫後轉存 PDF」手動勾選項(機關管理員;UAT 批61 文件範本功能配套)。
 *
 * 跑法:npx tsx src/scripts/migrate-journey-template-download.ts
 * 冪等:同 stage 已存在同標題項目即跳過(以標題精準比對,不動任何既有項目=尊重後台編輯)。
 * seed-journey.ts 已同步加入此項(新裝適用);既有安裝的 journey seed 已存在即跳過,故需本腳本。
 */
import { prisma } from '../lib/db';

const NEW_TITLE = '下載文件範本，依式填寫後轉存 PDF';
const NEW_HINT = '於「稽核前資料準備」頁整包下載中心提供之範本(Word/Excel)，填寫完成轉 PDF 後上傳對應項目;中心未提供範本時可略過此項。';

async function main() {
  const template = await prisma.journeyTemplate.findUnique({ where: { scope: 'CYCLE' } });
  if (!template) {
    console.log('[migrate] 無 CYCLE 精靈範本,無事可做。');
    return;
  }
  const stage = await prisma.journeyStage.findFirst({
    where: { templateId: template.id, stageKey: 'PREPARATION' },
  });
  if (!stage) {
    console.log('[migrate] CYCLE 範本無 PREPARATION 階段,無事可做。');
    return;
  }
  const existing = await prisma.journeyItem.findFirst({
    where: { stageId: stage.id, title: NEW_TITLE },
  });
  if (existing) {
    console.log('[migrate] 項目已存在,跳過。');
    return;
  }

  await prisma.$transaction(async (tx) => {
    // 讓出第一個位置:既有項目 orderIndex 全部 +1
    await tx.journeyItem.updateMany({
      where: { stageId: stage.id },
      data: { orderIndex: { increment: 1 } },
    });
    await tx.journeyItem.create({
      data: {
        stageId: stage.id,
        title: NEW_TITLE,
        hint: NEW_HINT,
        role: 'ORG_ADMIN',
        // 手動勾選項:autoKey null + informational false;href 交由 journeyItemHref 推導(PREPARATION → /prep)
        orderIndex: 0,
      },
    });
  });
  console.log('[migrate] 已於 PREPARATION 階段插入「下載文件範本」項。');
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
