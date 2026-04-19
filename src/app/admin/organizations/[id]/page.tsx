import Link from 'next/link';
import { notFound } from 'next/navigation';
import { prisma } from '@/lib/db';
import { auth } from '@/lib/auth';
import { AppShell } from '@/components/shell/AppShell';
import { Card, CardTitle, CardDescription } from '@/components/ui/Card';
import { Chip } from '@/components/ui/Chip';
import { inviteStatus } from '@/lib/invite';
import type { Role } from '@/lib/types';
import InvitePanel from './InvitePanel';
import CreateCycleButton from './CreateCycleButton';
import { CYCLE_STATUS_LABELS } from '@/lib/state-machine';
import type { CycleStatus } from '@/lib/types';

const roleLabel: Record<Role, string> = {
  ADMIN: '平台管理員',
  AUDITOR: '稽核委員',
  RESPONDENT: '填報人',
  SUPERVISOR: '單位主管',
};

export default async function OrganizationDetail({ params }: { params: { id: string } }) {
  const session = await auth();
  const user = session!.user;

  const org = await prisma.organization.findUnique({
    where: { id: params.id },
    include: {
      users: { orderBy: [{ role: 'asc' }, { createdAt: 'asc' }] },
      invitations: { orderBy: { createdAt: 'desc' } },
      cycles: {
        include: {
          checklistVersion: { select: { year: true } },
          _count: { select: { responses: true, findings: true } },
        },
        orderBy: { year: 'desc' },
      },
    },
  });
  if (!org) notFound();

  const activeVersions = await prisma.checklistVersion.findMany({
    where: { isActive: true },
    orderBy: { year: 'desc' },
  });

  const pendingInvites = org.invitations.filter(
    (i) => inviteStatus(i) === 'pending',
  );

  return (
    <AppShell
      user={{ name: user.name, email: user.email, role: user.role, organizationName: user.organizationName }}
      crumbs={[
        { label: '管理', href: '/admin/organizations' },
        { label: '醫院管理', href: '/admin/organizations' },
        { label: org.name },
      ]}
    >
      <header className="mb-6 flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-headline text-on-surface">{org.name}</h1>
          <p className="mt-1 text-body-sm text-on-surface-variant">
            <span className="font-mono">{org.code}</span>
            {org.shortName ? <> · {org.shortName}</> : null}
            {' · '}
            建立於 {new Date(org.createdAt).toLocaleDateString('zh-TW')}
          </p>
        </div>
      </header>

      {/* Users + invites */}
      <section className="mb-8">
        <div className="flex items-baseline justify-between mb-3">
          <h2 className="text-title-lg text-on-surface">人員 · 邀請</h2>
          <InvitePanel orgId={org.id} orgName={org.name} />
        </div>
        <Card padded={false} variant="outlined">
          <div className="px-5 py-3 bg-surface-container-low text-label-sm uppercase tracking-wide text-on-surface-variant border-b border-outline-variant/60">
            已啟用帳號
          </div>
          {org.users.length === 0 ? (
            <div className="px-5 py-6 text-center text-body-sm text-on-surface-variant">
              尚無啟用中的使用者
            </div>
          ) : (
            <table className="w-full text-body-sm">
              <tbody>
                {org.users.map((u) => (
                  <tr key={u.id} className="border-t border-outline-variant/60">
                    <td className="px-5 py-3">
                      <div className="font-medium text-on-surface">{u.name}</div>
                      <div className="text-caption font-mono text-on-surface-variant">{u.email}</div>
                    </td>
                    <td className="px-5 py-3">
                      <Chip size="sm" tone={u.role === 'SUPERVISOR' ? 'warning' : u.role === 'ADMIN' ? 'primary' : 'neutral'}>
                        {roleLabel[u.role as Role]}
                      </Chip>
                    </td>
                    <td className="px-5 py-3 text-right text-caption text-on-surface-variant">
                      {u.lastLoginAt
                        ? <>最後登入 {new Date(u.lastLoginAt).toLocaleString('zh-TW')}</>
                        : <>尚未登入</>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {pendingInvites.length > 0 && (
            <>
              <div className="px-5 py-3 bg-surface-container-low text-label-sm uppercase tracking-wide text-on-surface-variant border-y border-outline-variant/60">
                待接受邀請（{pendingInvites.length}）
              </div>
              <table className="w-full text-body-sm">
                <tbody>
                  {pendingInvites.map((inv) => (
                    <tr key={inv.id} className="border-t border-outline-variant/60 first:border-t-0">
                      <td className="px-5 py-3">
                        <div className="font-medium text-on-surface">{inv.name}</div>
                        <div className="text-caption font-mono text-on-surface-variant">{inv.email}</div>
                      </td>
                      <td className="px-5 py-3">
                        <Chip size="sm" tone="warning">{roleLabel[inv.role as Role]}</Chip>
                      </td>
                      <td className="px-5 py-3 text-right text-caption text-on-surface-variant">
                        至 {new Date(inv.expiresAt).toLocaleDateString('zh-TW')} 前
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}
        </Card>
      </section>

      {/* Cycles */}
      <section className="mb-8">
        <div className="flex items-baseline justify-between mb-3">
          <h2 className="text-title-lg text-on-surface">稽核週期</h2>
          <CreateCycleButton
            orgId={org.id}
            orgName={org.name}
            versions={activeVersions.map((v) => ({ id: v.id, year: v.year, name: v.name }))}
          />
        </div>
        {org.cycles.length === 0 ? (
          <Card>
            <CardTitle>尚未開立稽核週期</CardTitle>
            <CardDescription>點右上「建立週期」以年度版本建立一份新的週期。</CardDescription>
          </Card>
        ) : (
          <Card padded={false} variant="outlined">
            <table className="w-full text-body-sm">
              <thead className="bg-surface-container-low text-label-sm uppercase tracking-wide text-on-surface-variant">
                <tr>
                  <th className="text-left px-5 py-3 font-medium">年度</th>
                  <th className="text-left px-5 py-3 font-medium">題庫版本</th>
                  <th className="text-left px-5 py-3 font-medium">狀態</th>
                  <th className="text-right px-5 py-3 font-medium">填答</th>
                  <th className="text-right px-5 py-3 font-medium">發現</th>
                  <th className="text-right px-5 py-3 font-medium">截止日</th>
                  <th className="text-right px-5 py-3 font-medium">進入</th>
                </tr>
              </thead>
              <tbody>
                {org.cycles.map((c) => (
                  <tr key={c.id} className="border-t border-outline-variant/60 hover:bg-surface-container-low transition-colors">
                    <td className="px-5 py-3 tabular-nums">{c.year - 1911} 年</td>
                    <td className="px-5 py-3 text-on-surface-variant">{c.checklistVersion.year - 1911} 版</td>
                    <td className="px-5 py-3">
                      <Chip size="sm" tone="neutral">{CYCLE_STATUS_LABELS[c.status as CycleStatus]}</Chip>
                    </td>
                    <td className="px-5 py-3 text-right tabular-nums">{c._count.responses}</td>
                    <td className="px-5 py-3 text-right tabular-nums">{c._count.findings}</td>
                    <td className="px-5 py-3 text-right text-on-surface-variant">
                      {new Date(c.dueDate).toLocaleDateString('zh-TW')}
                    </td>
                    <td className="px-5 py-3 text-right">
                      <Link href={`/cycles/${c.id}`} className="text-primary-700 hover:text-primary-800">
                        開啟
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        )}
      </section>
    </AppShell>
  );
}
