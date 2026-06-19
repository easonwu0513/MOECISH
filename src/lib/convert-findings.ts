import { prisma } from './db';

/**
 * 把週期內尚未轉換的「待改善/建議」稽核發現建立為缺失(共用核心):
 * - 法遵符合情形(COMPLIANCE)不轉
 * - 項次依構面×類型接續編號;原發現回填 deficiencyId 鎖定
 * 回傳轉換筆數。
 */
export async function convertFindingsToDeficiencies(cycleId: string, createdById: string) {
  const pending = await prisma.auditFinding.findMany({
    where: { cycleId, deficiencyId: null, kind: { in: ['IMPROVE', 'SUGGEST'] } },
    orderBy: [{ aspect: 'asc' }, { kind: 'asc' }, { createdAt: 'asc' }],
  });
  if (pending.length === 0) return 0;

  const existing = await prisma.deficiency.groupBy({
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

    const def = await prisma.deficiency.create({
      data: {
        cycleId,
        aspect: f.aspect,
        type: f.kind, // IMPROVE / SUGGEST 與 DeficiencyType 同值
        itemNo,
        description: f.content,
        checklistRef: f.checklistRef,
        createdById,
        action: { create: {} }, // 與手動建缺失一致;否則機關無法填報/送審矯正(閉環斷裂)
      },
    });
    await prisma.auditFinding.update({
      where: { id: f.id },
      data: { deficiencyId: def.id },
    });
    converted++;
  }
  return converted;
}
