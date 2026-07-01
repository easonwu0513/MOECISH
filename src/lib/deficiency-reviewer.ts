import { prisma } from './db';

/**
 * 某缺失的「相關開立委員」= 回填至此缺失的稽核發現(auditFinding.deficiencyId=該缺失)之作者(去重)。
 * 中心只能從此清單中指派審閱委員(單一來源即一位;整併多來源即多位)。
 */
export async function deficiencyAuthors(deficiencyId: string): Promise<{ id: string; name: string }[]> {
  const findings = await prisma.auditFinding.findMany({
    where: { deficiencyId },
    select: { auditor: { select: { id: true, name: true } } },
    orderBy: { createdAt: 'asc' },
  });
  const map = new Map<string, string>();
  for (const f of findings) if (f.auditor) map.set(f.auditor.id, f.auditor.name);
  return Array.from(map, ([id, name]) => ({ id, name }));
}
