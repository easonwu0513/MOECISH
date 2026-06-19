import Link from 'next/link';
import { prisma } from '@/lib/db';
import { auth } from '@/lib/auth';
import { AppShell } from '@/components/shell/AppShell';
import { Card } from '@/components/ui/Card';
import { Chip } from '@/components/ui/Chip';
import { EmptyState } from '@/components/ui/EmptyState';
import { TableScroll } from '@/components/ui/TableScroll';
import { Users } from '@/components/icons';
import { inviteStatus } from '@/lib/invite';
import type { Role } from '@/lib/types';
import GlobalInvitePanel from './GlobalInvitePanel';
import UserRowActions from './UserRowActions';
import InviteRowActions from './InviteRowActions';

const roleLabel: Record<Role, string> = {
  SUPER_ADMIN: '最高管理員',
  AUDITOR: '稽核委員',
  ORG_ADMIN: '機關管理員',
};

const roleTone: Record<Role, 'primary' | 'sage' | 'neutral' | 'warning'> = {
  SUPER_ADMIN: 'primary',
  AUDITOR: 'sage',
  ORG_ADMIN: 'warning',
};

export default async function UsersPage() {
  const session = await auth();
  const user = session!.user;

  const users = await prisma.user.findMany({
    include: { organization: true },
    orderBy: [{ createdAt: 'desc' }],
  });
  const invites = await prisma.invitation.findMany({
    include: { organization: true },
    orderBy: { createdAt: 'desc' },
  });
  const pendingInvites = invites.filter((i) => inviteStatus(i) === 'pending');

  return (
    <AppShell
      user={{ name: user.name, email: user.email, role: user.role, organizationName: user.organizationName }}
      crumbs={[{ label: '管理', href: '/admin/organizations' }, { label: '使用者' }]}
    >
      <header className="mb-6 flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-headline text-on-surface">使用者管理</h1>
          <p className="mt-1 text-body-sm text-on-surface-variant leading-relaxed">
            全系統帳號總覽。稽核委員與管理員用右上角邀請;機關管理員請至
            <Link href="/admin/organizations" className="text-primary-700 hover:underline mx-1">醫院管理</Link>
            選擇對應醫院 → 邀請人員。
          </p>
        </div>
        <GlobalInvitePanel />
      </header>

      {pendingInvites.length > 0 && (
        <Card padded={false} variant="outlined" className="mb-8">
          <div className="px-5 py-3 bg-warning-50 text-warning-700 text-label-sm uppercase tracking-wide border-b border-outline-variant/60">
            待接受邀請（{pendingInvites.length}）
          </div>
          <TableScroll>
          <table className="w-full text-body-sm">
            <thead className="text-label-sm uppercase tracking-wide text-on-surface-variant bg-surface-container-low">
              <tr>
                <th className="text-left px-5 py-3 font-medium">姓名 / Email</th>
                <th className="text-left px-5 py-3 font-medium">角色</th>
                <th className="text-left px-5 py-3 font-medium">所屬醫院</th>
                <th className="text-right px-5 py-3 font-medium">到期</th>
                <th className="text-right px-5 py-3 font-medium">操作</th>
              </tr>
            </thead>
            <tbody>
              {pendingInvites.map((inv) => (
                <tr key={inv.id} className="border-t border-outline-variant/60">
                  <td className="px-5 py-3">
                    <div className="font-medium text-on-surface">{inv.name}</div>
                    <div className="text-caption font-mono text-on-surface-variant">{inv.email}</div>
                  </td>
                  <td className="px-5 py-3">
                    <Chip size="sm" tone={roleTone[inv.role as Role]}>{roleLabel[inv.role as Role]}</Chip>
                  </td>
                  <td className="px-5 py-3 text-on-surface-variant">{inv.organization?.name ?? '—'}</td>
                  <td className="px-5 py-3 text-right text-caption text-on-surface-variant">
                    {new Date(inv.expiresAt).toLocaleDateString('zh-TW')}
                  </td>
                  <td className="px-5 py-3 text-right">
                    <InviteRowActions inviteId={inv.id} email={inv.email} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </TableScroll>
        </Card>
      )}

      {users.length === 0 ? (
        <Card>
          <EmptyState
            icon={<Users size={28} />}
            title="尚無使用者"
            description="前往醫院管理建立邀請。"
          />
        </Card>
      ) : (
        <Card padded={false} variant="outlined">
          <TableScroll>
          <table className="w-full text-body-sm">
            <thead className="text-label-sm uppercase tracking-wide text-on-surface-variant bg-surface-container-low">
              <tr>
                <th className="text-left px-5 py-3 font-medium">姓名 / Email</th>
                <th className="text-left px-5 py-3 font-medium">角色</th>
                <th className="text-left px-5 py-3 font-medium">所屬醫院</th>
                <th className="text-left px-5 py-3 font-medium">狀態</th>
                <th className="text-right px-5 py-3 font-medium">最後登入</th>
                <th className="text-right px-5 py-3 font-medium">操作</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id} className="border-t border-outline-variant/60 hover:bg-surface-container-low transition-colors">
                  <td className="px-5 py-3">
                    <div className="font-medium text-on-surface">{u.name}</div>
                    <div className="text-caption font-mono text-on-surface-variant">{u.email}</div>
                  </td>
                  <td className="px-5 py-3">
                    <Chip size="sm" tone={roleTone[u.role as Role]}>{roleLabel[u.role as Role]}</Chip>
                  </td>
                  <td className="px-5 py-3 text-on-surface-variant">{u.organization?.name ?? '—'}</td>
                  <td className="px-5 py-3">
                    {u.isActive
                      ? <Chip size="sm" tone="success">啟用</Chip>
                      : <Chip size="sm" tone="neutral">停用</Chip>}
                  </td>
                  <td className="px-5 py-3 text-right text-caption text-on-surface-variant">
                    {u.lastLoginAt ? new Date(u.lastLoginAt).toLocaleString('zh-TW') : '尚未登入'}
                  </td>
                  <td className="px-5 py-3 text-right">
                    <UserRowActions
                      userId={u.id}
                      name={u.name}
                      role={u.role as Role}
                      isActive={u.isActive}
                      hasOrganization={!!u.organizationId}
                      isSelf={u.id === user.id}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </TableScroll>
        </Card>
      )}
    </AppShell>
  );
}
