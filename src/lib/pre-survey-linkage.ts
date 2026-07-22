import { prisma } from '@/lib/db';

// UAT 圖37:調查場次構面 → 稽核週期指派負責構面
export const SURVEY_TO_ASSIGN: Record<string, string> = {
  管理面: 'MANAGEMENT',
  策略面: 'STRATEGY',
  技術面: 'TECHNICAL',
  '管理面-OT': 'MANAGEMENT_OT',
};

/**
 * UAT 圖37 連動核心:把委員(userId)加入各來源週期的「稽核委員指派」(AuditorAssignment)。
 *  - 僅做「加入/補構面」;不反向移除(避免誤刪已有評分/審閱紀錄的指派)。
 *  - COI:服務該機關(現職或有效授權)者跳過並回報。
 * 供「儲存指派」與「帶入補標」兩處共用,行為一致。
 */
export async function linkMemberToCycles(
  userId: string,
  items: Array<{ cycleId: string; aspect: string | null }>,
): Promise<{ linkedCycles: string[]; skippedCoi: string[] }> {
  const linkedCycles: string[] = [];
  const skippedCoi: string[] = [];
  if (items.length === 0) return { linkedCycles, skippedCoi };

  const [pUser, grants, cycles] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId }, select: { organizationId: true } }),
    prisma.userRole.findMany({
      where: { userId, endedAt: null, organizationId: { not: null } },
      select: { organizationId: true },
    }),
    prisma.auditCycle.findMany({
      where: { id: { in: items.map((i) => i.cycleId) } },
      select: { id: true, organizationId: true, organization: { select: { name: true, shortName: true } } },
    }),
  ]);
  const servedOrgIds = new Set(
    [pUser?.organizationId, ...grants.map((g) => g.organizationId)].filter(Boolean) as string[],
  );
  const aspectByCycle = new Map(items.map((i) => [i.cycleId, i.aspect]));

  for (const c of cycles) {
    const orgLabel = c.organization.shortName ?? c.organization.name;
    if (servedOrgIds.has(c.organizationId)) {
      skippedCoi.push(orgLabel);
      continue;
    }
    const mapped = SURVEY_TO_ASSIGN[aspectByCycle.get(c.id) ?? ''] ?? null;
    const existingAssign = await prisma.auditorAssignment.findUnique({
      where: { cycleId_auditorId: { cycleId: c.id, auditorId: userId } },
      select: { id: true, dimensions: true },
    });
    if (!existingAssign) {
      await prisma.auditorAssignment.create({
        data: { cycleId: c.id, auditorId: userId, dimensions: mapped ? JSON.stringify([mapped]) : null },
      });
      linkedCycles.push(orgLabel);
    } else if (mapped) {
      let cur: string[] = [];
      try {
        const a = JSON.parse(existingAssign.dimensions ?? '[]');
        cur = Array.isArray(a) ? a.filter((x): x is string => typeof x === 'string') : [];
      } catch {
        cur = [];
      }
      if (!cur.includes(mapped)) {
        await prisma.auditorAssignment.update({
          where: { id: existingAssign.id },
          data: { dimensions: JSON.stringify([...cur, mapped]) },
        });
        linkedCycles.push(`${orgLabel}（補構面）`);
      }
    }
  }
  return { linkedCycles, skippedCoi };
}
