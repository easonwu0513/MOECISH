import { prisma } from '@/lib/db';
import { auth } from '@/lib/auth';
import { AppShell } from '@/components/shell/AppShell';
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
      include: { organization: true, roleGrants: { where: { endedAt: null } } },
      orderBy: [{ createdAt: 'desc' }],
    }),
    prisma.invitation.findMany({
      include: { organization: true },
      orderBy: { createdAt: 'desc' },
    }),
    prisma.organization.findMany({ select: { id: true, name: true }, orderBy: { name: 'asc' } }),
  ]);
  // 實習紀錄(批32):有練習發現的帳號列「實習紀錄」連結(觀察員或已晉升委員皆適用)
  const practiced = await prisma.practiceFinding.groupBy({ by: ['observerId'] });
  const practicedIds = new Set(practiced.map((g) => g.observerId));

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

  // 多重身分(批31):角色欄同時列出現用身分+其他有效授權身分——
  // 只顯示現用身分時,中心無從得知「現用機關管理員、另持觀察員授權」者可被配對為觀察員
  const orgNameById = new Map(orgs.map((o) => [o.id, o.name] as const));
  const userRows: UserRow[] = users.map((u) => {
    // I UAT:現用身分無所屬醫院(如切換為觀察員/委員)時,退回其持有的 ORG_ADMIN 授權醫院顯示,避免顯「—」
    const orgAdminG = u.roleGrants.find((g) => g.role === 'ORG_ADMIN' && g.organizationId);
    const grantOrgName = orgAdminG?.organizationId ? orgNameById.get(orgAdminG.organizationId) ?? null : null;
    return {
    id: u.id,
    name: u.name,
    email: u.email,
    role: u.role as Role,
    orgId: u.organizationId,
    orgName: u.organization?.name ?? grantOrgName,
    otherIdentities: u.roleGrants
      .filter((g) => !(g.role === u.role && g.organizationId === u.organizationId))
      .map((g) => ({
        role: g.role as Role,
        orgName: g.organizationId ? orgNameById.get(g.organizationId) ?? null : null,
      })),
    isActive: u.isActive,
    lastLoginAtISO: u.lastLoginAt ? u.lastLoginAt.toISOString() : null,
    disableReason: u.disableReason,
    disabledByName: u.disabledByName,
    disabledAtISO: u.disabledAt ? u.disabledAt.toISOString() : null,
    isSelf: u.id === user.id,
    hasPractice: practicedIds.has(u.id),
    };
  });

  return (
    <AppShell
      user={{ name: user.name, email: user.email, role: user.role, organizationName: user.organizationName }}
      crumbs={[{ label: '管理' }, { label: '使用者' }]}
    >
      <header className="mb-9 pb-5 border-b border-rule flex items-end justify-between gap-4 flex-wrap">
        <div className="min-w-0">
          <h1 className="text-headline-lg text-ink-900 tracking-tight">使用者管理</h1>
          <p className="mt-2.5 text-body-sm text-ink-500 max-w-2xl leading-relaxed">
            全系統帳號與邀請的單一入口：邀請 → 待接受（過期可重寄）→ 啟用 → 停用，同一張表管到底。
          </p>
        </div>
        <div className="flex gap-2 flex-wrap shrink-0">
          <InviteDialog orgs={orgs} triggerLabel="邀請人員" />
        </div>
      </header>

      <UsersDirectory invites={inviteRows} users={userRows} orgs={orgs} />
    </AppShell>
  );
}
