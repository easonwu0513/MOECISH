import type { Role } from './types';
import { auth } from './auth';
import { prisma } from './db';

export class AuthError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

export async function requireUser() {
  const session = await auth();
  if (!session?.user) throw new AuthError(401, '未登入');
  return session.user;
}

export async function requireRole(...roles: Role[]) {
  const user = await requireUser();
  if (!roles.includes(user.role)) throw new AuthError(403, '權限不足');
  return user;
}

/**
 * 週期存取控制：
 * - SUPER_ADMIN：全部
 * - AUDITOR：限被指派之週期（assignments）
 * - ORG_ADMIN：限自家機關之週期
 */
export async function assertCycleAccess(cycleId: string) {
  const user = await requireUser();
  const cycle = await prisma.auditCycle.findUnique({
    where: { id: cycleId },
    include: { assignments: true },
  });
  if (!cycle) throw new AuthError(404, '稽核週期不存在');

  switch (user.role) {
    case 'SUPER_ADMIN':
      break;
    case 'AUDITOR': {
      const assigned = cycle.assignments.some((a) => a.auditorId === user.id);
      if (!assigned) throw new AuthError(403, '您未被指派此稽核週期');
      break;
    }
    case 'ORG_ADMIN':
      if (cycle.organizationId !== user.organizationId) {
        throw new AuthError(403, '不可存取他機關的稽核週期');
      }
      break;
  }
  return { user, cycle };
}

/**
 * 缺失存取控制（連同所屬週期一起驗證），回傳 user + deficiency(含 cycle/action)。
 */
export async function assertDeficiencyAccess(deficiencyId: string) {
  const user = await requireUser();
  const deficiency = await prisma.deficiency.findUnique({
    where: { id: deficiencyId },
    include: {
      cycle: { include: { assignments: true } },
      action: { include: { reviews: { orderBy: { decidedAt: 'asc' } } } },
    },
  });
  if (!deficiency) throw new AuthError(404, '缺失不存在');

  const cycle = deficiency.cycle;
  switch (user.role) {
    case 'SUPER_ADMIN':
      break;
    case 'AUDITOR': {
      const assigned = cycle.assignments.some((a) => a.auditorId === user.id);
      if (!assigned) throw new AuthError(403, '您未被指派此稽核週期');
      break;
    }
    case 'ORG_ADMIN':
      if (cycle.organizationId !== user.organizationId) {
        throw new AuthError(403, '不可存取他機關的資料');
      }
      break;
  }
  return { user, deficiency };
}
