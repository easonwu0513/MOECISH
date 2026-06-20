import Link from 'next/link';
import { prisma } from '@/lib/db';
import { auth } from '@/lib/auth';
import { AppShell } from '@/components/shell/AppShell';
import { PageHeader } from '@/components/shell/PageHeader';
import { Card } from '@/components/ui/Card';
import { Chip } from '@/components/ui/Chip';
import { EmptyState } from '@/components/ui/EmptyState';
import { TableScroll } from '@/components/ui/TableScroll';
import { Table, THead, Th, Tr, Td } from '@/components/ui/DataTable';
import { Users } from '@/components/icons';
import { inviteStatus } from '@/lib/invite';
import { ROLE_LABELS, ROLE_TONE, type Role } from '@/lib/types';
import { fmtROC, fmtROCDateTime } from '@/lib/date';
import GlobalInvitePanel from './GlobalInvitePanel';
import UserRowActions from './UserRowActions';
import InviteRowActions from './InviteRowActions';

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
      crumbs={[{ label: '管理' }, { label: '使用者' }]}
    >
      <PageHeader
        title="使用者管理"
        subtitle={
          <>
            全系統帳號總覽。稽核委員與管理員用右上角邀請;機關管理員請至
            <Link href="/admin/organizations" className="text-primary-700 hover:underline mx-1">醫院管理</Link>
            選擇對應醫院 → 邀請人員。
          </>
        }
        actions={<GlobalInvitePanel />}
      />

      {pendingInvites.length > 0 && (
        <Card padded={false} variant="outlined" className="mb-8">
          <div className="px-5 py-3 bg-warning-50 text-warning-700 text-label-sm uppercase tracking-wide border-b border-outline-variant/60">
            待接受邀請（{pendingInvites.length}）
          </div>
          <TableScroll>
          <Table>
            <THead>
              <Th>姓名 / Email</Th>
              <Th>角色</Th>
              <Th>所屬醫院</Th>
              <Th numeric>到期</Th>
              <Th numeric>操作</Th>
            </THead>
            <tbody>
              {pendingInvites.map((inv) => (
                <Tr key={inv.id} hover={false}>
                  <Td>
                    <div className="font-medium text-on-surface">{inv.name}</div>
                    <div className="text-caption font-mono text-on-surface-variant">{inv.email}</div>
                  </Td>
                  <Td>
                    <Chip size="sm" tone={ROLE_TONE[inv.role as Role]}>{ROLE_LABELS[inv.role as Role]}</Chip>
                  </Td>
                  <Td className="text-on-surface-variant">{inv.organization?.name ?? '—'}</Td>
                  <Td className="text-right text-caption text-on-surface-variant tabular-nums">
                    {fmtROC(inv.expiresAt)}
                  </Td>
                  <Td className="text-right">
                    <InviteRowActions inviteId={inv.id} email={inv.email} />
                  </Td>
                </Tr>
              ))}
            </tbody>
          </Table>
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
          <Table>
            <THead>
              <Th>姓名 / Email</Th>
              <Th>角色</Th>
              <Th>所屬醫院</Th>
              <Th>狀態</Th>
              <Th numeric>最後登入</Th>
              <Th numeric>操作</Th>
            </THead>
            <tbody>
              {users.map((u) => (
                <Tr key={u.id}>
                  <Td>
                    <div className="font-medium text-on-surface">{u.name}</div>
                    <div className="text-caption font-mono text-on-surface-variant">{u.email}</div>
                  </Td>
                  <Td>
                    <Chip size="sm" tone={ROLE_TONE[u.role as Role]}>{ROLE_LABELS[u.role as Role]}</Chip>
                  </Td>
                  <Td className="text-on-surface-variant">{u.organization?.name ?? '—'}</Td>
                  <Td>
                    {u.isActive
                      ? <Chip size="sm" tone="success">啟用</Chip>
                      : <Chip size="sm" tone="neutral">停用</Chip>}
                  </Td>
                  <Td className="text-right text-caption text-on-surface-variant tabular-nums">
                    {u.lastLoginAt ? fmtROCDateTime(u.lastLoginAt) : '尚未登入'}
                  </Td>
                  <Td className="text-right">
                    <UserRowActions
                      userId={u.id}
                      name={u.name}
                      role={u.role as Role}
                      isActive={u.isActive}
                      hasOrganization={!!u.organizationId}
                      isSelf={u.id === user.id}
                    />
                  </Td>
                </Tr>
              ))}
            </tbody>
          </Table>
          </TableScroll>
        </Card>
      )}
    </AppShell>
  );
}
