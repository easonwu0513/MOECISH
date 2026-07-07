import { notFound, redirect } from 'next/navigation';
import { prisma } from '@/lib/db';
import { auth } from '@/lib/auth';
import { AppShell } from '@/components/shell/AppShell';
import { EmptyState } from '@/components/ui/EmptyState';
import { History } from '@/components/icons';
import { fmtROCDateTime } from '@/lib/date';
import { auditorCanSeeCycle, type Role } from '@/lib/types';
import { getCycleActivities } from '@/lib/cycle-activity';

/**
 * 週期活動歷史(UAT:機關管理員不只一位時,需看到其他管理員做了什麼的完整紀錄)。
 * 存取控制與角色範圍與週期頁「最近活動」一致(共用 getCycleActivities);機關看本院、委員看自己、中心看全部。
 * 最多 200 筆(週期層級,非全站鑑識台=admin/audit-log,故機關可見)。
 */
export default async function CycleActivityPage({ params }: { params: { id: string } }) {
  const session = await auth();
  if (!session) redirect(`/login?callbackUrl=/cycles/${params.id}/activity`);
  const user = session.user;

  const cycle = await prisma.auditCycle.findUnique({
    where: { id: params.id },
    include: {
      organization: true,
      assignments: { select: { id: true, auditorId: true } },
      deficiencies: { select: { id: true, reviewerAuditorId: true, action: { select: { id: true } } } },
      signedReports: { select: { id: true } },
    },
  });
  if (!cycle) notFound();
  // 存取控制(對齊週期頁):機關限本院、委員須受指派且非開立中
  if (user.role === 'ORG_ADMIN' && cycle.organizationId !== user.organizationId) redirect('/dashboard');
  if (user.role === 'AUDITOR' && (!cycle.assignments.some((a) => a.auditorId === user.id) || !auditorCanSeeCycle(cycle.status))) {
    redirect('/dashboard');
  }

  const yearROC = cycle.year - 1911;
  // 委員的缺失軌跡限本人審閱範圍(對齊週期頁 reviewer-aware)
  const myDefs = user.role === 'AUDITOR'
    ? cycle.deficiencies.filter((d) => d.reviewerAuditorId === user.id)
    : cycle.deficiencies;

  const activities = await getCycleActivities({
    cycleId: cycle.id,
    role: user.role as Role,
    userId: user.id,
    organizationId: user.organizationId,
    assignmentIds: cycle.assignments.map((a) => a.id),
    deficiencyIds: myDefs.map((d) => d.id),
    actionIds: myDefs.map((d) => d.action?.id).filter((x): x is string => Boolean(x)),
    signedReportIds: cycle.signedReports.map((r) => r.id),
    limit: 200,
  });

  return (
    <AppShell
      user={{ name: user.name, email: user.email, role: user.role, organizationName: user.organizationName }}
      cycleId={cycle.id}
      crumbs={[
        { label: '總覽', href: '/dashboard' },
        { label: '稽核週期', href: '/cycles' },
        { label: `${yearROC} 年度 · ${cycle.organization.name}`, href: `/cycles/${cycle.id}` },
        { label: '活動歷史' },
      ]}
    >
      <header className="mb-6">
        <h1 className="text-headline text-ink-900 flex items-center gap-2">
          <History size={22} className="text-ink-500" />活動歷史
        </h1>
        <p className="mt-1.5 text-body-sm text-ink-500 leading-relaxed">
          {yearROC} 年度 · {cycle.organization.name}
          {user.role === 'ORG_ADMIN' && ' · 顯示貴機關於本週期的全部操作紀錄'}
          {user.role === 'SUPER_ADMIN' && ' · 顯示本週期全部操作紀錄'}
          {user.role === 'AUDITOR' && ' · 顯示您於本週期的操作紀錄'}
        </p>
      </header>

      {activities.length === 0 ? (
        <div className="rounded-lg border border-rule bg-card">
          <div className="p-6">
            <EmptyState icon={<History size={28} />} title="尚無活動紀錄" description="本週期的操作後將自動留存於此。" />
          </div>
        </div>
      ) : (
        <div className="rounded-lg border border-rule bg-card">
          <ul className="divide-y divide-rule">
            {activities.map((a) => (
              <li key={a.id} className="flex items-start gap-3 px-5 py-3.5">
                <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary-500" aria-hidden />
                <div className="min-w-0 flex-1">
                  <p className="text-body-sm text-ink-900 leading-snug">
                    <span className="font-medium">{a.who}</span> {a.what}
                  </p>
                </div>
                <span className="shrink-0 text-caption text-ink-500 tabular-nums">{fmtROCDateTime(a.at)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </AppShell>
  );
}
