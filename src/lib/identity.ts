import { prisma } from './db';
import { ROLES, type Role } from './types';

/**
 * 多重身分(批31/方案A):
 * - UserRole(授權表)= 此帳號「可用的身分集合」;User.role/organizationId = 「現用身分」。
 * - 相容:無任何有效授權列的既有帳號 = 單一身分(User.role 視為隱含授權);現用身分若不在
 *   授權表內(歷史帳號/直接改 role 的舊路徑)一律補列為隱含身分,確保「現用」永遠合法、
 *   切換選單永遠包含現在這個身分。
 * - 切換 = 改寫 User.role/organizationId,騎乘 auth.ts jwt callback「每請求回查 DB」機制,
 *   下一請求 session 即生效(無需動 NextAuth)。
 */
export type Identity = {
  role: Role;
  organizationId: string | null;
  organizationName: string | null;
  /** 有授權列者帶 grantId;隱含身分(legacy)無 */
  grantId?: string;
  current: boolean;
};

export async function listIdentities(userId: string): Promise<Identity[]> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      role: true,
      organizationId: true,
      organization: { select: { name: true } },
      roleGrants: {
        where: { endedAt: null },
        orderBy: { createdAt: 'asc' },
        select: { id: true, role: true, organizationId: true },
      },
    },
  });
  if (!user) return [];

  const orgIds = Array.from(new Set(user.roleGrants.map((g) => g.organizationId).filter(Boolean))) as string[];
  const orgs = orgIds.length
    ? await prisma.organization.findMany({ where: { id: { in: orgIds } }, select: { id: true, name: true } })
    : [];
  const orgName = (id: string | null) => (id ? orgs.find((o) => o.id === id)?.name ?? null : null);

  const isCurrent = (role: string, orgId: string | null) =>
    role === user.role && (orgId ?? null) === (user.organizationId ?? null);

  const out: Identity[] = user.roleGrants
    .filter((g) => (ROLES as readonly string[]).includes(g.role))
    .map((g) => ({
      role: g.role as Role,
      organizationId: g.organizationId ?? null,
      organizationName: orgName(g.organizationId ?? null),
      grantId: g.id,
      current: isCurrent(g.role, g.organizationId ?? null),
    }));

  // 現用身分不在授權表 → 補列為隱含身分(legacy 相容;永遠保證 current 在清單內)
  if (!out.some((i) => i.current)) {
    out.unshift({
      role: user.role as Role,
      organizationId: user.organizationId ?? null,
      organizationName: user.organization?.name ?? null,
      current: true,
    });
  }
  return out;
}

/** 帳號是否持有某角色的「有效授權」(含隱含身分=現用 role);利益迴避檢核用。 */
export async function holdsActiveRole(userId: string, role: Role, organizationId?: string): Promise<boolean> {
  const ids = await listIdentities(userId);
  return ids.some(
    (i) => i.role === role && (organizationId === undefined || i.organizationId === organizationId),
  );
}
