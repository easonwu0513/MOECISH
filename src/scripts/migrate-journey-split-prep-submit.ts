/**
 * 一次性冪等遷移:把精靈「確認資料齊全後按『確定繳交』分別送交各類資料」單一項
 * 拆成「技術檢測」「實地稽核」兩項(對齊 UAT:兩類截止日不同、可分次繳交,精靈應各自打勾)。
 *
 * 跑法:npx tsx src/scripts/migrate-journey-split-prep-submit.ts
 * 冪等:同 stage 已存在 autoKey=prep_submitted_tech 即跳過;原項就地改寫(保留 id/進度),
 * 後續項 orderIndex +1 讓出位置給新增的實地稽核項。seed-journey.ts 已同步改為兩項(新裝適用)。
 */
import { prisma } from '../lib/db';

async function main() {
  const targets = await prisma.journeyItem.findMany({
    where: { autoKey: 'prep_submitted' },
    include: { stage: { select: { id: true, stageKey: true } } },
  });
  if (targets.length === 0) {
    console.log('[migrate] 無 autoKey=prep_submitted 項目,無事可做。');
    return;
  }

  for (const item of targets) {
    const already = await prisma.journeyItem.findFirst({
      where: { stageId: item.stageId, autoKey: 'prep_submitted_tech' },
    });
    if (already) {
      console.log(`[migrate] stage ${item.stage.stageKey}:已拆分過,跳過。`);
      continue;
    }

    await prisma.$transaction(async (tx) => {
      // 讓出 orderIndex:原項之後的項目全部 +1
      await tx.journeyItem.updateMany({
        where: { stageId: item.stageId, orderIndex: { gt: item.orderIndex } },
        data: { orderIndex: { increment: 1 } },
      });
      // 原項就地改為「技術檢測」(保留 id,既有 JourneyProgress 不受影響;autoKey 項完成度由規則自動判定)
      await tx.journeyItem.update({
        where: { id: item.id },
        data: { title: '技術檢測資料齊全後按「確定繳交」送交中心', autoKey: 'prep_submitted_tech' },
      });
      // 新增「實地稽核」項,緊跟其後
      await tx.journeyItem.create({
        data: {
          stageId: item.stageId,
          title: '實地稽核資料齊全後按「確定繳交」送交中心',
          role: item.role,
          autoKey: 'prep_submitted_onsite',
          orderIndex: item.orderIndex + 1,
        },
      });
    });
    console.log(`[migrate] stage ${item.stage.stageKey}:已拆分為 技術檢測/實地稽核 兩項。`);
  }
  console.log('[migrate] 完成。');
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
