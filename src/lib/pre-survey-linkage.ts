import { prisma } from '@/lib/db';
import { canAssignAuditors } from '@/lib/stage';
import type { CycleStatus } from '@/lib/types';

// UAT 圖37:調查場次構面 → 稽核週期指派負責構面
export const SURVEY_TO_ASSIGN: Record<string, string> = {
  管理面: 'MANAGEMENT',
  策略面: 'STRATEGY',
  技術面: 'TECHNICAL',
  '管理面-OT': 'MANAGEMENT_OT',
};

function unionDimensions(existing: string | null, mapped: string | null): string | null | undefined {
  if (!mapped) return undefined; // 無新構面 → 不動
  let cur: string[] = [];
  try {
    const a = JSON.parse(existing ?? '[]');
    cur = Array.isArray(a) ? a.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    cur = [];
  }
  if (cur.includes(mapped)) return undefined;
  return JSON.stringify([...cur, mapped]);
}

/**
 * UAT 圖37 連動核心:把委員(userId)加入各來源週期的「稽核委員指派」(AuditorAssignment)。
 *  - 僅做「加入/補構面」;不反向移除(避免誤刪已有評分/審閱紀錄的指派)。
 *  - COI:服務該機關(現職或有效授權)者跳過並回報。
 * 供「儲存指派」與「帶入補標」兩處共用,行為一致。
 */
export async function linkMemberToCycles(
  userId: string,
  items: Array<{ cycleId: string; aspect: string | null }>,
): Promise<{ linkedCycles: string[]; skippedCoi: string[]; skippedOther: string[] }> {
  const linkedCycles: string[] = [];
  const skippedCoi: string[] = [];
  const skippedOther: string[] = [];
  if (items.length === 0) return { linkedCycles, skippedCoi, skippedOther };

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
    // 互斥鏡像(對抗審查 B):同人同週期不得既是觀察員又是委員——手動指派 API 硬擋,連動亦須擋
    // (雙重身分者可能先以觀察員連動入配對,再以委員身分被指派同場次)。
    const alsoObserver = await prisma.cycleObserver.findUnique({
      where: { cycleId_observerId: { cycleId: c.id, observerId: userId } },
      select: { id: true },
    });
    if (alsoObserver) {
      skippedOther.push(`${orgLabel}（已是本週期配對觀察員）`);
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
      const next = unionDimensions(existingAssign.dimensions, mapped);
      if (next !== undefined) {
        await prisma.auditorAssignment.update({
          where: { id: existingAssign.id },
          data: { dimensions: next },
        });
        linkedCycles.push(`${orgLabel}（補構面）`);
      }
    }
  }
  return { linkedCycles, skippedCoi, skippedOther };
}

/**
 * UAT 圖49 連動核心:把觀察員(userId)加入各來源週期的「觀察員配對」(CycleObserver,
 * mentorId 先空=指導委員待設定,由中心至週期進階設定指定;構面帶入 dimensions)。
 * 硬擋規則與手動配對(/api/cycles/[id]/observers POST)一致:
 *  - 名單凍結(canAssignAuditors=false)不加;
 *  - COI:觀察員不得觀摩自己服務之機關(現用身分機關或持該機關 ORG_ADMIN 授權);
 *  - 互斥:該員已是本週期指派委員、或已是其他觀察員的指導者 → 不加;
 * 擋到即跳過並回報;僅做「加入/補構面」,不反向移除、不動已設定的 mentorId。
 */
export async function linkObserverToCycles(
  userId: string,
  items: Array<{ cycleId: string; aspect: string | null }>,
): Promise<{ linkedCycles: string[]; skippedCoi: string[]; skippedOther: string[]; created: number }> {
  const linkedCycles: string[] = [];
  const skippedCoi: string[] = [];
  const skippedOther: string[] = [];
  let created = 0; // 新建配對數(補構面不算)→ 只有真的新增「指導委員待設定」列才提示
  if (items.length === 0) return { linkedCycles, skippedCoi, skippedOther, created };

  const [obs, cycles] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: {
        role: true,
        isActive: true,
        organizationId: true,
        roleGrants: { where: { endedAt: null }, select: { role: true, organizationId: true } },
      },
    }),
    prisma.auditCycle.findMany({
      where: { id: { in: items.map((i) => i.cycleId) } },
      select: { id: true, status: true, organizationId: true, organization: { select: { name: true, shortName: true } } },
    }),
  ]);
  // 與手動配對同規則:帳號須有效且具「觀察員」身分(現用或有效授權),否則整批不連動
  const holdsObserverIdentity = obs && (obs.role === 'OBSERVER' || obs.roleGrants.some((g) => g.role === 'OBSERVER'));
  if (!obs || !obs.isActive || !holdsObserverIdentity) return { linkedCycles, skippedCoi, skippedOther, created };
  const aspectByCycle = new Map(items.map((i) => [i.cycleId, i.aspect]));

  for (const c of cycles) {
    const orgLabel = c.organization.shortName ?? c.organization.name;
    if (!canAssignAuditors(c.status as CycleStatus)) {
      skippedOther.push(`${orgLabel}（名單已凍結）`);
      continue;
    }
    const holdsOrgAdminOfCycleOrg = obs.roleGrants.some(
      (g) => g.role === 'ORG_ADMIN' && g.organizationId === c.organizationId,
    );
    if ((obs.organizationId && obs.organizationId === c.organizationId) || holdsOrgAdminOfCycleOrg) {
      skippedCoi.push(orgLabel);
      continue;
    }
    const [alsoAuditor, isMentorOfOthers] = await Promise.all([
      prisma.auditorAssignment.findUnique({
        where: { cycleId_auditorId: { cycleId: c.id, auditorId: userId } },
        select: { auditorId: true },
      }),
      prisma.cycleObserver.count({ where: { cycleId: c.id, mentorId: userId } }),
    ]);
    if (alsoAuditor) {
      skippedOther.push(`${orgLabel}（已是本週期指派委員）`);
      continue;
    }
    if (isMentorOfOthers > 0) {
      skippedOther.push(`${orgLabel}（已是本週期指導者）`);
      continue;
    }
    const mapped = SURVEY_TO_ASSIGN[aspectByCycle.get(c.id) ?? ''] ?? null;
    const existing = await prisma.cycleObserver.findUnique({
      where: { cycleId_observerId: { cycleId: c.id, observerId: userId } },
      select: { id: true, dimensions: true },
    });
    if (!existing) {
      await prisma.cycleObserver.create({
        data: { cycleId: c.id, observerId: userId, mentorId: null, dimensions: mapped ? JSON.stringify([mapped]) : null },
      });
      linkedCycles.push(orgLabel);
      created += 1;
    } else {
      const next = unionDimensions(existing.dimensions, mapped);
      if (next !== undefined) {
        await prisma.cycleObserver.update({ where: { id: existing.id }, data: { dimensions: next } });
        linkedCycles.push(`${orgLabel}（補構面）`);
      }
    }
  }
  return { linkedCycles, skippedCoi, skippedOther, created };
}
