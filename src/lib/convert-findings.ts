import { Prisma } from '@prisma/client';
import { prisma } from './db';

/**
 * 把週期內尚未轉換的「待改善/建議」稽核發現建立為缺失(共用核心):
 * - 法遵符合情形(COMPLIANCE)不轉
 * - 項次依構面×類型接續編號;原發現回填 deficiencyId 鎖定
 * 回傳轉換筆數。
 * @param db 可傳入交易 client(`$transaction`)以與呼叫端共用同一交易;預設用全域 prisma。
 */
export async function convertFindingsToDeficiencies(
  cycleId: string,
  createdById: string,
  db: Prisma.TransactionClient = prisma,
) {
  const pending = await db.auditFinding.findMany({
    where: { cycleId, deficiencyId: null, kind: { in: ['IMPROVE', 'SUGGEST'] } },
    orderBy: [{ aspect: 'asc' }, { kind: 'asc' }, { createdAt: 'asc' }],
  });
  if (pending.length === 0) return 0;

  const existing = await db.deficiency.groupBy({
    by: ['aspect', 'type'],
    where: { cycleId },
    _max: { itemNo: true },
  });
  const nextNo = new Map<string, number>();
  for (const g of existing) {
    nextNo.set(`${g.aspect}:${g.type}`, (g._max.itemNo ?? 0) + 1);
  }

  let converted = 0;
  for (const f of pending) {
    const key = `${f.aspect}:${f.kind}`;
    const itemNo = nextNo.get(key) ?? 1;
    nextNo.set(key, itemNo + 1);

    const def = await db.deficiency.create({
      data: {
        cycleId,
        aspect: f.aspect,
        type: f.kind, // IMPROVE / SUGGEST 與 DeficiencyType 同值
        itemNo,
        description: f.content,
        checklistRef: f.checklistRef,
        createdById,
        reviewerAuditorId: f.auditorId, // 預設審閱委員=開立此發現的委員;中心可於缺失頁改指派其他委員
        action: { create: {} }, // 與手動建缺失一致;否則機關無法填報/送審矯正(閉環斷裂)
      },
    });
    await db.auditFinding.update({
      where: { id: f.id },
      data: { deficiencyId: def.id },
    });
    converted++;
  }
  return converted;
}
