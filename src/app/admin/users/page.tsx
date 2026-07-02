import { prisma } from '@/lib/db';
import { auth } from '@/lib/auth';
import { AppShell } from '@/components/shell/AppShell';
import { PageHeader } from '@/components/shell/PageHeader';
import { inviteStatus } from '@/lib/invite';
import type { Role } from '@/lib/types';
import InviteDialog from '@/components/admin/InviteDialog';
import UsersDirectory, { type InviteRow, type UserRow } from './UsersDirectory';

/**
 * 使用者管理:全系統帳號與邀請的單一入口(統一管理過程)。
 * 生命週期:邀請(待接受→已過期可重寄)→ 開通 → 啟用中(改角色/重設密碼/停用)→ 已停用(可再啟用)。
 * 三種角色皆由右上角「邀請人員」建立(機關管理員於對話框內選所屬醫院,不再分流至醫院管理)。
 */
export default async function UsersPage() {
  const session = await auth();
  const user = session!.user;

  const [users, invites, orgs] = await Promise.all([
    prisma.user.findMany({
      include: { organization: true },
      orderBy: [{ createdAt: 'desc' }],
    }),
    prisma.invitation.findMany({
      include: { organization: true },
      orderBy: { createdAt: 'desc' },
    }),
    prisma.organization.findMany({ select: { id: true, name: true }, orderBy: { name: 'asc' } }),
  ]);

  // 生命週期視圖只列「待接受/已過期」邀請(已接受者已成帳號、已撤銷者已有替代邀請,不列避免噪音)
  const inviteRows: InviteRow[] = invites
    .map((i) => ({ inv: i, status: inviteStatus(i) }))
    .filter(({ status }) => status === 'pending' || status === 'expired')
    .map(({ inv, status }) => ({
      id: inv.id,
      name: inv.name,
      email: inv.email,
      role: inv.role as Role,
      orgId: inv.organizationId,
      orgName: inv.organization?.name ?? null,
      expiresAtISO: inv.expiresAt.toISOString(),
      status: status as 'pending' | 'expired',
    }));

  const userRows: UserRow[] = users.map((u) => ({
    id: u.id,
    name: u.name,
    email: u.email,
    role: u.role as Role,
    orgId: u.organizationId,
    orgName: u.organization?.name ?? null,
    isActive: u.isActive,
    lastLoginAtISO: u.lastLoginAt ? u.lastLoginAt.toISOString() : null,
    disableReason: u.disableReason,
    disabledByName: u.disabledByName,
    disabledAtISO: u.disabledAt ? u.disabledAt.toISOString() : null,
    isSelf: u.id === user.id,
  }));

  return (
    <AppShell
      user={{ name: user.name, email: user.email, role: user.role, organizationName: user.organizationName }}
      crumbs={[{ label: '管理' }, { label: '使用者' }]}
    >
      <PageHeader
        title="使用者管理"
        subtitle="全系統帳號與邀請的單一入口:邀請 → 待接受(過期可重寄)→ 啟用 → 停用,同一張表管到底。"
        actions={<InviteDialog orgs={orgs} triggerLabel="邀請人員" />}
      />

      <UsersDirectory invites={inviteRows} users={userRows} orgs={orgs} />
    </AppShell>
  );
}
