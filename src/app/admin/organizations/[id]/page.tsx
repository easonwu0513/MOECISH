import Link from 'next/link';
import { notFound } from 'next/navigation';
import { prisma } from '@/lib/db';
import { auth } from '@/lib/auth';
import { AppShell } from '@/components/shell/AppShell';
import { PageHeader } from '@/components/shell/PageHeader';
import { Card, CardTitle, CardDescription } from '@/components/ui/Card';
import { Chip } from '@/components/ui/Chip';
import { inviteStatus } from '@/lib/invite';
import { ROLE_LABELS, ROLE_TONE, type Role } from '@/lib/types';
import { fmtROC, fmtROCDateTime, rocYear } from '@/lib/date';
import InviteDialog from '@/components/admin/InviteDialog';
import DeleteCycleButton from '@/components/cycle/DeleteCycleButton';
import CreateCycleButton from './CreateCycleButton';
import { CYCLE_STATUS_LABELS } from '@/lib/state-machine';
import type { CycleStatus } from '@/lib/types';

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
          _count: { select: { responses: true, deficiencies: true } },
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
        { label: '管理' },
        { label: '醫院管理', href: '/admin/organizations' },
        { label: org.name },
      ]}
    >
      <PageHeader
        title={org.name}
        subtitle={
          <>
            <span className="font-mono">{org.code}</span>
            {org.shortName ? <> · {org.shortName}</> : null}
            {' · '}
            建立於 {fmtROC(org.createdAt)}
          </>
        }
      />

      {/* Users + invites */}
      <section className="mb-8">
        <div className="flex items-baseline justify-between mb-3">
          <h2 className="text-title-lg text-ink-900">人員 · 邀請</h2>
          {/* 統一邀請對話框(與使用者管理同一元件):鎖定本院、角色固定機關管理員 */}
          <InviteDialog
            orgs={[{ id: org.id, name: org.name }]}
            defaultRole="ORG_ADMIN"
            defaultOrgId={org.id}
            lockOrg
            triggerLabel="邀請人員"
          />
        </div>
        <Card padded={false} variant="outlined">
          <div className="px-5 py-3 bg-paper-sunk text-label-sm uppercase tracking-wide text-ink-500 border-b border-rule">
            已啟用帳號
          </div>
          {org.users.length === 0 ? (
            <div className="px-5 py-6 text-center text-body-sm text-ink-500">
              尚無啟用中的使用者
            </div>
          ) : (
            <table className="w-full text-body-sm">
              <tbody>
                {org.users.map((u) => (
                  <tr key={u.id} className="border-t border-rule">
                    <td className="px-5 py-3">
                      <div className="font-medium text-ink-900">{u.name}</div>
                      <div className="text-caption font-mono text-ink-500">{u.email}</div>
                    </td>
                    <td className="px-5 py-3">
                      <Chip size="sm" tone={ROLE_TONE[u.role as Role]}>
                        {ROLE_LABELS[u.role as Role]}
                      </Chip>
                    </td>
                    <td className="px-5 py-3 text-right text-caption text-ink-500">
                      {u.lastLoginAt
                        ? <>最後登入 {fmtROCDateTime(u.lastLoginAt)}</>
                        : <>尚未登入</>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {pendingInvites.length > 0 && (
            <>
              <div className="px-5 py-3 bg-paper-sunk text-label-sm uppercase tracking-wide text-ink-500 border-y border-rule">
                待接受邀請（{pendingInvites.length}）
              </div>
              <table className="w-full text-body-sm">
                <tbody>
                  {pendingInvites.map((inv) => (
                    <tr key={inv.id} className="border-t border-rule first:border-t-0">
                      <td className="px-5 py-3">
                        <div className="font-medium text-ink-900">{inv.name}</div>
                        <div className="text-caption font-mono text-ink-500">{inv.email}</div>
                      </td>
                      <td className="px-5 py-3">
                        <Chip size="sm" tone={ROLE_TONE[inv.role as Role]}>{ROLE_LABELS[inv.role as Role]}</Chip>
                      </td>
                      <td className="px-5 py-3 text-right text-caption text-ink-500">
                        至 {fmtROC(inv.expiresAt)} 前
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
          <h2 className="text-title-lg text-ink-900">稽核週期</h2>
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
              <thead className="bg-paper-sunk text-label-sm uppercase tracking-wide text-ink-500">
                <tr>
                  <th className="text-left px-5 py-3 font-medium">年度</th>
                  <th className="text-left px-5 py-3 font-medium">題庫版本</th>
                  <th className="text-left px-5 py-3 font-medium">狀態</th>
                  <th className="text-right px-5 py-3 font-medium">填答</th>
                  <th className="text-right px-5 py-3 font-medium">缺失</th>
                  <th className="text-right px-5 py-3 font-medium">截止日</th>
                  <th className="text-right px-5 py-3 font-medium">進入</th>
                </tr>
              </thead>
              <tbody>
                {org.cycles.map((c) => (
                  <tr key={c.id} className="border-t border-rule hover:bg-paper-sunk transition-colors">
                    <td className="px-5 py-3 tabular-nums">{rocYear(c.year)} 年</td>
                    <td className="px-5 py-3 text-ink-500 tabular-nums">{rocYear(c.checklistVersion.year)} 版</td>
                    <td className="px-5 py-3">
                      <Chip size="sm" tone="neutral">{CYCLE_STATUS_LABELS[c.status as CycleStatus]}</Chip>
                    </td>
                    <td className="px-5 py-3 text-right tabular-nums">{c._count.responses}</td>
                    <td className="px-5 py-3 text-right tabular-nums">{c._count.deficiencies}</td>
                    <td className="px-5 py-3 text-right text-ink-500 tabular-nums">
                      {fmtROC(c.dueDate)}
                    </td>
                    <td className="px-5 py-3 text-right">
                      <span className="inline-flex items-center gap-2">
                        <Link href={`/cycles/${c.id}`} className="text-primary-700 hover:text-primary-800">
                          開啟
                        </Link>
                        {/* 建錯醫院/年度可刪:僅開立中(DRAFT);推進後不可刪(後端亦擋) */}
                        {c.status === 'DRAFT' && (
                          <DeleteCycleButton cycleId={c.id} orgName={org.name} yearROC={rocYear(c.year)} />
                        )}
                      </span>
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
