/**
 * 一次性冪等遷移(UAT 批69):把「列印改善報告用印上傳(signed_uploaded)」與
 * 「確認機關用印報告並正式結案(signed_confirmed)」兩個引導項,自「結案(CLOSED)」階段
 * 移到「矯正執行中(REMEDIATION)」階段尾端。
 *
 * 理由:推進至結案的 transition 閘(批 P2)要求用印掃描檔已上傳且經中心確認——
 * 這兩項是「結案的前提」而非「結案階段的工作」;放在結案階段=永遠推不進的雞生蛋矛盾。
 * 同步更新兩階段 summary,並為結案階段補一條純提醒項(否則移走後該階段空無一物)。
 *
 * 跑法:npx tsx src/scripts/migrate-close-items-to-remediation.ts
 * 冪等:以 autoKey(signed_uploaded/signed_confirmed)辨識(不受標題被編輯影響);
 *       已不在 CLOSED 階段 → no-op。JourneyProgress 以 itemId 為鍵,搬移 stageId 不影響既有勾選。
 */
import { prisma } from '../lib/db';

async function main() {
  const closed = await prisma.journeyStage.findFirst({
    where: { stageKey: 'CLOSED', template: { scope: 'CYCLE' } },
    select: { id: true, title: true },
  });
  const remediation = await prisma.journeyStage.findFirst({
    where: { stageKey: 'REMEDIATION', template: { scope: 'CYCLE' } },
    select: { id: true, title: true },
  });
  if (!closed || !remediation) {
    console.log('[migrate] 找不到 CLOSED / REMEDIATION 階段(CYCLE 範本),無事可做。');
    return;
  }

  const toMove = await prisma.journeyItem.findMany({
    where: { stageId: closed.id, autoKey: { in: ['signed_uploaded', 'signed_confirmed'] } },
    orderBy: { orderIndex: 'asc' },
    select: { id: true, title: true, autoKey: true },
  });
  if (toMove.length === 0) {
    console.log('[migrate] CLOSED 階段已無 signed_* 項目(已遷移過),no-op。');
  } else {
    const agg = await prisma.journeyItem.aggregate({
      where: { stageId: remediation.id },
      _max: { orderIndex: true },
    });
    let order = (agg._max.orderIndex ?? -1) + 1;
    // 依原相對順序(signed_uploaded 先)搬到矯正執行中尾端;機關項標題補「全數通過後：」語境
    const sorted = [...toMove].sort((a) => (a.autoKey === 'signed_uploaded' ? -1 : 1));
    for (const it of sorted) {
      const retitle =
        it.autoKey === 'signed_uploaded' && !it.title.startsWith('全數通過後')
          ? { title: `全數通過後：${it.title}` }
          : {};
      await prisma.journeyItem.update({
        where: { id: it.id },
        data: { stageId: remediation.id, orderIndex: order++, ...retitle },
      });
      console.log(`[migrate] 移動:「${it.title}」→ ${remediation.title}(orderIndex=${order - 1})`);
    }
  }

  // 結案階段補一條純提醒項(移走後空無一物;冪等:同標題已存在則跳過)
  const reminderTitle = '本週期已正式結案；資料唯讀留存，可供日後查閱';
  const hasReminder = await prisma.journeyItem.findFirst({
    where: { stageId: closed.id, title: reminderTitle },
    select: { id: true },
  });
  if (!hasReminder) {
    const aggC = await prisma.journeyItem.aggregate({ where: { stageId: closed.id }, _max: { orderIndex: true } });
    await prisma.journeyItem.create({
      data: {
        stageId: closed.id,
        title: reminderTitle,
        informational: true,
        orderIndex: (aggC._max.orderIndex ?? -1) + 1,
      },
    });
    console.log('[migrate] 結案階段已補純提醒項。');
  }

  // 兩階段 summary 對齊新語意(冪等:直接覆寫為目標值)
  await prisma.journeyStage.update({
    where: { id: remediation.id },
    data: { summary: '機關逐項填報改善措施；委員審查；中心追蹤。全數通過後機關列印改善報告用印上傳，中心確認後結案。' },
  });
  await prisma.journeyStage.update({
    where: { id: closed.id },
    data: { summary: '用印報告已於矯正執行中完成上傳與確認；本週期資料唯讀留存。' },
  });
  console.log('[migrate] 完成:summary 已更新。');
}

main()
  .catch((e) => {
    console.error('[migrate] 失敗：', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
