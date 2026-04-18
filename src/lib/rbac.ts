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

export async function assertCycleAccess(cycleId: string) {
  const user = await requireUser();
  const cycle = await prisma.auditCycle.findUnique({
    where: { id: cycleId },
    include: { assignments: true },
  });
  if (!cycle) throw new AuthError(404, '稽核週期不存在');

  switch (user.role) {
    case 'ADMIN':
      break;
    case 'AUDITOR':
      // Prototype: any auditor can access; production → check assignments
      break;
    case 'RESPONDENT':
    case 'SUPERVISOR':
      if (cycle.organizationId !== user.organizationId) {
        throw new AuthError(403, '不可存取他機關的稽核週期');
      }
      break;
  }
  return { user, cycle };
}
