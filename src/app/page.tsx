import Link from 'next/link';
import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { AppShell } from '@/components/shell/AppShell';
import { Card, CardTitle, CardDescription } from '@/components/ui/Card';
import { Chip } from '@/components/ui/Chip';
import { Button } from '@/components/ui/Button';
import { ProgressRing } from '@/components/ui/ProgressRing';
import { ProgressBar } from '@/components/ui/ProgressBar';
import { EmptyState } from '@/components/ui/EmptyState';
import {
  ClipboardCheck,
  ChevronRight,
  AlertTriangle,
  CheckCircle,
} from '@/components/icons';
import { CYCLE_STATUS_LABELS } from '@/lib/state-machine';
import type { CycleStatus } from '@/lib/types';
import { greetingByHour, EMPTY } from '@/lib/copy';

export default async function HomePage() {
  const session = await auth();
  if (!session) redirect('/login');
  const user = session.user;

  const cyclesWhere =
    user.role === 'RESPONDENT' || user.role === 'SUPERVISOR'
      ? { organizationId: user.organizationId ?? '__none__' }
      : {};

  const cycles = await prisma.auditCycle.findMany({
    where: cyclesWhere,
    include: {
      organization: true,
      checklistVersion: { include: { _count: { select: { items: true } } } },
      responses: { select: { compliance: true } },
      findings: { select: { type: true, remediation: { select: { status: true } } } },
      signatures: { select: { signerRole: true } },
    },
    orderBy: [{ year: 'desc' }, { createdAt: 'desc' }],
  });

  const primary = cycles[0];
  const totalItems = primary?.checklistVersion._count.items ?? 0;
  const filled = primary?.responses.filter((r) => r.compliance).length ?? 0;
  const comp = primary?.responses.filter((r) => r.compliance === 'COMPLIANT').length ?? 0;
  const partial = primary?.responses.filter((r) => r.compliance === 'PARTIALLY_COMPLIANT').length ?? 0;
  const nonCompliant = primary?.responses.filter((r) => r.compliance === 'NON_COMPLIANT').length ?? 0;
  const notApplicable = primary?.responses.filter((r) => r.compliance === 'NOT_APPLICABLE').length ?? 0;

  // Todos
  const todos: {
    key: string;
    tone: 'warning' | 'primary' | 'sage' | 'neutral';
    title: string;
    href: string;
    cta: string;
  }[] = [];

  if (primary) {
    if (user.role === 'RESPONDENT' || user.role === 'SUPERVISOR') {
      const unresolvedCount = await prisma.auditorComment.count({
        where: { response: { cycleId: primary.id }, resolvedAt: null },
      });
      if (unresolvedCount > 0) {
        todos.push({
          key: 'comments',
          tone: 'warning',
          title: `${unresolvedCount} 條委員意見待補正`,
          href: `/cycles/${primary.id}/checklist`,
          cta: '去補正',
        });
      }
      const draftCount = primary.findings.filter(
        (f) => f.type === 'NEEDS_IMPROVEMENT' && (f.remediation?.status === 'DRAFT' || f.remediation?.status === 'NEEDS_REWORK' || f.remediation?.status === 'PENDING'),
      ).length;
      if (draftCount > 0) {
        todos.push({
          key: 'remediation',
          tone: 'primary',
          title: `${draftCount} 項改善措施待填報`,
          href: `/cycles/${primary.id}/findings`,
          cta: '繼續填',
        });
      }
      const myRole = user.role === 'SUPERVISOR' ? 'SUPERVISOR' : 'RESPONDENT';
      const hasSig = primary.signatures.some((s) => s.signerRole === myRole);
      if (!hasSig) {
        todos.push({
          key: 'sig',
          tone: 'neutral',
          title: `${myRole === 'SUPERVISOR' ? '單位主管' : '填報人'}簽章尚未上傳`,
          href: `/cycles/${primary.id}`,
          cta: '下載範本',
        });
      }
    } else if (user.role === 'AUDITOR' || user.role === 'ADMIN') {
      const submittedCount = primary.findings.filter((f) => f.remediation?.status === 'SUBMITTED').length;
      if (submittedCount > 0) {
        todos.push({
          key: 'decisions',
          tone: 'warning',
          title: `${submittedCount} 項改善待審核`,
          href: `/cycles/${primary.id}/findings`,
          cta: '去審核',
        });
      }
      if (primary.status === 'RESPONDENT_SUBMITTED' || primary.status === 'SUPERVISOR_APPROVED' || primary.status === 'IN_REVIEW') {
        todos.push({
          key: 'review',
          tone: 'primary',
          title: '稽核週期等待委員審閱',
          href: `/cycles/${primary.id}/review`,
          cta: '進入審閱',
        });
      }
    }
  }

  const now = new Date();
  const greeting = greetingByHour(now.getHours());
  const today = now.toLocaleDateString('zh-TW', {
    year: 'numeric', month: 'long', day: 'numeric', weekday: 'long',
  });

  return (
    <AppShell
      user={{
        name: user.name,
        email: user.email,
        role: user.role,
        organizationName: user.organizationName,
      }}
      crumbs={[{ label: '總覽' }]}
    >
      {/* Hero header */}
      <section className="mb-8">
        <p className="text-caption text-neutral-500 tracking-[0.08em] uppercase">{today}</p>
        <h1 className="mt-1 text-display-sm text-neutral-900 text-balance">
          {greeting}，{user.name}。
        </h1>
        {primary && todos.length > 0 ? (
          <p className="mt-2 text-body text-neutral-600 max-w-2xl text-pretty">
            今天有 <span className="font-semibold text-neutral-900">{todos.length}</span> 項待辦需處理。
            先把待辦清掉再進稽核週期會比較順。
          </p>
        ) : primary ? (
          <p className="mt-2 text-body text-neutral-600">
            目前沒有待辦，隨時可進入稽核週期檢視進度。
          </p>
        ) : null}
      </section>

      {primary ? (
        <>
          {/* Hero metric: progress + stats */}
          <section className="grid grid-cols-1 lg:grid-cols-5 gap-4 mb-6">
            <Card className="lg:col-span-3" padded={false}>
              <div className="p-6 sm:p-7">
                <div className="flex items-start justify-between gap-3 mb-5 flex-wrap">
                  <div className="min-w-0">
                    <p className="text-caption text-neutral-500 tracking-[0.06em] uppercase">本次稽核</p>
                    <CardTitle className="mt-1 text-title-lg">填答進度</CardTitle>
                    <CardDescription>
                      {primary.year - 1911} 年度 · {primary.organization.name}
                    </CardDescription>
                  </div>
                  <Chip tone={cycleTone(primary.status as CycleStatus)} size="md" dot>
                    {CYCLE_STATUS_LABELS[primary.status as CycleStatus]}
                  </Chip>
                </div>

                <div className="flex items-center gap-8 flex-wrap">
                  <ProgressRing
                    value={filled}
                    max={totalItems}
                    size={128}
                    strokeWidth={10}
                    label={`${totalItems ? Math.round((filled / totalItems) * 100) : 0}%`}
                    sublabel={`${filled} / ${totalItems} 題`}
                  />
                  <div className="flex-1 min-w-[240px]">
                    <div className="grid grid-cols-2 gap-x-5 gap-y-2.5">
                      <StatLine label="符合"     count={comp}          total={totalItems} tone="success" />
                      <StatLine label="部分符合" count={partial}       total={totalItems} tone="warning" />
                      <StatLine label="不符合"   count={nonCompliant}  total={totalItems} tone="danger"  />
                      <StatLine label="不適用"   count={notApplicable} total={totalItems} tone="neutral" />
                    </div>
                    <p className="mt-5 text-body-sm text-neutral-500">
                      {totalItems - filled > 0
                        ? <>尚餘 <span className="font-semibold text-neutral-900">{totalItems - filled}</span> 題未作答</>
                        : <>全部題目已作答</>}
                    </p>
                  </div>
                </div>

                <div className="mt-6 flex gap-2">
                  <Link href={`/cycles/${primary.id}`}>
                    <Button size="md">進入稽核週期</Button>
                  </Link>
                  <Link href={`/cycles/${primary.id}/checklist`}>
                    <Button variant="secondary" size="md" leadingIcon={<ClipboardCheck size={16} />}>
                      直接填答
                    </Button>
                  </Link>
                </div>
              </div>
            </Card>

            <Card className="lg:col-span-2">
              <div className="flex items-center justify-between mb-4">
                <CardTitle className="text-title-lg">待辦</CardTitle>
                <span className="text-caption text-neutral-400">按緊急度排序</span>
              </div>
              <div className="flex flex-col gap-1.5">
                {todos.length === 0 ? (
                  <div className="flex flex-col items-center text-center py-8 px-2">
                    <div className="w-11 h-11 rounded-full bg-success-50 text-success-600 flex items-center justify-center mb-3">
                      <CheckCircle size={22} />
                    </div>
                    <p className="text-body font-medium text-neutral-800">{EMPTY.noTodos.title}</p>
                    <p className="text-caption text-neutral-500 mt-0.5">{EMPTY.noTodos.description}</p>
                  </div>
                ) : (
                  todos.map((t) => (
                    <Link
                      key={t.key}
                      href={t.href}
                      className="group relative flex items-center gap-3 rounded-lg px-3 py-2.5 bg-white border border-hairline hover:border-strong hover:bg-neutral-25 hover:shadow-xs transition-all duration-180 ease-smooth focus-ring"
                    >
                      <span
                        className={
                          'w-1.5 h-1.5 rounded-full shrink-0 ' +
                          {
                            warning: 'bg-warning-500',
                            primary: 'bg-primary-500',
                            sage: 'bg-sage-500',
                            neutral: 'bg-neutral-400',
                          }[t.tone]
                        }
                        aria-hidden
                      />
                      <span className="flex-1 text-body-sm text-neutral-800 truncate">{t.title}</span>
                      <span className="text-caption text-neutral-400 group-hover:text-primary-700 shrink-0 inline-flex items-center gap-0.5 transition-colors">
                        {t.cta}
                        <ChevronRight size={14} />
                      </span>
                    </Link>
                  ))
                )}
              </div>
            </Card>
          </section>

          {/* Cycles list */}
          <section className="mb-8">
            <div className="flex items-baseline justify-between mb-3">
              <h2 className="text-title-lg text-neutral-900">我的稽核週期</h2>
              <span className="text-caption text-neutral-500">共 {cycles.length} 筆</span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {cycles.map((c) => {
                const total = c.checklistVersion._count.items;
                const done = c.responses.filter((r) => r.compliance).length;
                const pct = total ? Math.round((done / total) * 100) : 0;
                return (
                  <Link key={c.id} href={`/cycles/${c.id}`}>
                    <Card interactive>
                      <div className="flex items-center justify-between gap-3 mb-3">
                        <div className="min-w-0">
                          <p className="text-title text-neutral-900 truncate">
                            {c.year - 1911} 年度 · {c.organization.name}
                          </p>
                          <p className="text-caption text-neutral-500 mt-1">
                            截止 {new Date(c.dueDate).toLocaleDateString('zh-TW')}
                          </p>
                        </div>
                        <Chip tone={cycleTone(c.status as CycleStatus)} size="sm" dot>
                          {CYCLE_STATUS_LABELS[c.status as CycleStatus]}
                        </Chip>
                      </div>
                      <ProgressBar value={done} max={total} tone="primary" size="sm" />
                      <div className="mt-2 flex items-center justify-between text-caption">
                        <span className="text-neutral-500">
                          <span className="font-semibold text-neutral-900 tabular-nums">{done}</span>
                          <span className="text-neutral-400"> / {total}</span>
                        </span>
                        <span className="text-neutral-500 tabular-nums">{pct}%</span>
                      </div>
                    </Card>
                  </Link>
                );
              })}
            </div>
          </section>
        </>
      ) : (
        <Card padded={false}>
          <div className="p-6">
            <EmptyState
              icon={<ClipboardCheck size={28} />}
              title={EMPTY.noCycles.title}
              description={EMPTY.noCycles.description}
            />
          </div>
        </Card>
      )}
    </AppShell>
  );
}

function StatLine({
  label,
  count,
  total,
  tone,
}: {
  label: string;
  count: number;
  total: number;
  tone: 'success' | 'warning' | 'danger' | 'neutral';
}) {
  const dot = {
    success: 'bg-success-500',
    warning: 'bg-warning-500',
    danger: 'bg-danger-500',
    neutral: 'bg-neutral-400',
  }[tone];
  const pct = total > 0 ? Math.round((count / total) * 100) : 0;
  return (
    <div className="flex items-center gap-2.5 py-0.5">
      <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${dot}`} aria-hidden />
      <span className="text-body-sm text-neutral-700">{label}</span>
      <span className="flex-1 text-right">
        <span className="text-title text-neutral-900 tabular-nums">{count}</span>
        <span className="text-caption text-neutral-400 ml-1 tabular-nums">{pct}%</span>
      </span>
    </div>
  );
}

function cycleTone(status: CycleStatus): 'neutral' | 'primary' | 'sage' | 'success' | 'warning' {
  switch (status) {
    case 'DRAFT':                    return 'neutral';
    case 'RESPONDENT_SUBMITTED':
    case 'SUPERVISOR_APPROVED':      return 'primary';
    case 'IN_REVIEW':
    case 'ONSITE_SCHEDULED':         return 'sage';
    case 'COMMENTS_RETURNED':
    case 'FINDINGS_ISSUED':
    case 'REMEDIATION_IN_PROGRESS':  return 'warning';
    case 'CLOSED':                   return 'success';
  }
}
