import Link from 'next/link';
import { prisma } from '@/lib/db';
import { auth } from '@/lib/auth';
import { AppShell } from '@/components/shell/AppShell';
import { Card } from '@/components/ui/Card';
import { Chip } from '@/components/ui/Chip';
import { EmptyState } from '@/components/ui/EmptyState';
import { Users } from '@/components/icons';
import { inviteStatus } from '@/lib/invite';
import type { Role } from '@/lib/types';

const roleLabel: Record<Role, string> = {
  ADMIN: '平台管理員',
  AUDITOR: '稽核委員',
  RESPONDENT: '填報人',
  SUPERVISOR: '單位主管',
};

const roleTone: Record<Role, 'primary' | 'sage' | 'neutral' | 'warning'> = {
  ADMIN: 'primary',
  AUDITOR: 'sage',
  RESPONDENT: 'neutral',
  SUPERVISOR: 'warning',
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
      <header className="mb-6">
        <h1 className="text-headline text-on-surface">使用者管理</h1>
        <p className="mt-1 text-body-sm text-on-surface-variant">
          全系統帳號總覽。要新增使用者請至
          <Link href="/admin/organizations" className="text-primary-700 hover:underline mx-1">醫院管理</Link>
          選擇對應醫院 → 邀請人員。
        </p>
      </header>

      {pendingInvites.length > 0 && (
        <Card padded={false} variant="outlined" className="mb-8">
          <div className="px-5 py-3 bg-warning-50 text-warning-700 text-label-sm uppercase tracking-wide border-b border-outline-variant/60">
            待接受邀請（{pendingInvites.length}）
          </div>
          <table className="w-full text-body-sm">
            <thead className="text-label-sm uppercase tracking-wide text-on-surface-variant bg-surface-container-low">
              <tr>
                <th className="text-left px-5 py-3 font-medium">姓名 / Email</th>
                <th className="text-left px-5 py-3 font-medium">角色</th>
                <th className="text-left px-5 py-3 font-medium">所屬醫院</th>
                <th className="text-right px-5 py-3 font-medium">到期</th>
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
                </tr>
              ))}
            </tbody>
          </table>
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
          <table className="w-full text-body-sm">
            <thead className="text-label-sm uppercase tracking-wide text-on-surface-variant bg-surface-container-low">
              <tr>
                <th className="text-left px-5 py-3 font-medium">姓名 / Email</th>
                <th className="text-left px-5 py-3 font-medium">角色</th>
                <th className="text-left px-5 py-3 font-medium">所屬醫院</th>
                <th className="text-left px-5 py-3 font-medium">狀態</th>
                <th className="text-right px-5 py-3 font-medium">最後登入</th>
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
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </AppShell>
  );
}
