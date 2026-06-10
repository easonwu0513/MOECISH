import Link from 'next/link';
import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { AppShell } from '@/components/shell/AppShell';
import { Card, CardTitle, CardDescription } from '@/components/ui/Card';
import { Chip } from '@/components/ui/Chip';
import { Button } from '@/components/ui/Button';
import { ProgressBar } from '@/components/ui/ProgressBar';
import { EmptyState } from '@/components/ui/EmptyState';
import {
  ClipboardCheck,
  ChevronRight,
  CheckCircle,
  AlertCircle,
  ShieldCheck,
  Eye,
} from '@/components/icons';
import { CYCLE_STATUS_LABELS, cycleStatusTone } from '@/lib/state-machine';
import type { CycleStatus } from '@/lib/types';
import { greetingByHour, EMPTY } from '@/lib/copy';

type Todo = {
  key: string;
  tone: 'warning' | 'primary' | 'sage' | 'neutral' | 'danger';
  title: string;
  href: string;
  cta: string;
};

export default async function HomePage() {
  const session = await auth();
  if (!session) redirect('/login');
  const user = session.user;

  const cyclesWhere =
    user.role === 'ORG_ADMIN'
      ? { organizationId: user.organizationId ?? '__none__' }
      : user.role === 'AUDITOR'
      ? { assignments: { some: { auditorId: user.id } } }
      : {};

  const cycles = await prisma.auditCycle.findMany({
    where: cyclesWhere,
    include: {
      organization: true,
      deficiencies: { include: { action: { select: { status: true } } } },
    },
    orderBy: [{ year: 'desc' }, { createdAt: 'desc' }],
  });

  // ── 全域統計(跨週期) ──
  const allDefs = cycles.flatMap((c) => c.deficiencies.map((d) => ({ cycleId: c.id, status: d.action?.status ?? 'PENDING' })));
  const stat = (s: string) => allDefs.filter((d) => d.status === s).length;
  const totalDefs = allDefs.length;
  const passed = stat('PASSED');
  const submitted = stat('SUBMITTED');
  const returned = stat('RETURNED');
  const toFill = stat('PENDING') + stat('DRAFT');

  // ── 角色待辦 ──
  const todos: Todo[] = [];
  for (const c of cycles) {
    const cReturned = c.deficiencies.filter((d) => d.action?.status === 'RETURNED').length;
    const cToFill = c.deficiencies.filter((d) => !d.action?.status || d.action.status === 'PENDING' || d.action.status === 'DRAFT').length;
    const cSubmitted = c.deficiencies.filter((d) => d.action?.status === 'SUBMITTED').length;

    if (user.role === 'ORG_ADMIN' && c.status === 'REMEDIATION') {
      if (cReturned > 0) {
        todos.push({ key: `${c.id}-ret`, tone: 'danger', title: `${cReturned} 項被退回，需補正後重送`, href: `/cycles/${c.id}/deficiencies`, cta: '去補正' });
      }
      if (cToFill > 0) {
        todos.push({ key: `${c.id}-fill`, tone: 'primary', title: `${cToFill} 項矯正措施待填報`, href: `/cycles/${c.id}/deficiencies`, cta: '繼續填' });
      }
    }
    if (user.role === 'AUDITOR' && cSubmitted > 0) {
      todos.push({ key: `${c.id}-rev`, tone: 'warning', title: `${c.organization.shortName ?? c.organization.name}：${cSubmitted} 項矯正待審查`, href: `/cycles/${c.id}/deficiencies`, cta: '去審查' });
    }
    if (user.role === 'SUPER_ADMIN') {
      if (c.status === 'DRAFT') {
        todos.push({ key: `${c.id}-draft`, tone: 'neutral', title: `${c.organization.shortName ?? c.organization.name}：週期開立中，尚未發布缺失`, href: `/cycles/${c.id}/deficiencies`, cta: '去發布' });
      }
      if (c.status === 'REMEDIATION' && c.deficiencies.length > 0 && c.deficiencies.every((d) => d.action?.status === 'PASSED')) {
        todos.push({ key: `${c.id}-close`, tone: 'sage', title: `${c.organization.shortName ?? c.organization.name}：全數通過，可確認用印並結案`, href: `/cycles/${c.id}`, cta: '去結案' });
      }
    }
  }

  const now = new Date();
  const greeting = greetingByHour(now.getHours());
  const today = now.toLocaleDateString('zh-TW', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' });

  return (
    <AppShell
      user={{ name: user.name, email: user.email, role: user.role, organizationName: user.organizationName }}
      crumbs={[{ label: '總覽' }]}
    >
      {/* Hero */}
      <section className="mb-6">
        <p className="text-caption text-on-surface-variant tracking-wide">{today}</p>
        <h1 className="mt-2 text-display-sm text-on-surface text-balance">
          {greeting}，{user.name}。
        </h1>
        {todos.length > 0 ? (
          <p className="mt-3 text-body-lg text-on-surface-variant max-w-2xl text-pretty">
            今天有 <span className="font-semibold text-primary-700 tabular-nums">{todos.length}</span> 項待辦需處理。
          </p>
        ) : cycles.length > 0 ? (
          <p className="mt-3 text-body-lg text-on-surface-variant">
            目前沒有待辦，隨時可進入稽核週期檢視進度。
          </p>
        ) : null}
      </section>

      {cycles.length === 0 ? (
        <Card variant="outlined" padded={false}>
          <div className="p-6">
            <EmptyState
              icon={<ClipboardCheck size={28} />}
              title={EMPTY.noCycles.title}
              description={EMPTY.noCycles.description}
            />
          </div>
        </Card>
      ) : (
        <>
          {/* 統計列 */}
          <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            <StatTopBar
              tone="success"
              icon={<ShieldCheck size={20} />}
              primary={`${passed}/${totalDefs}`}
              label="矯正通過"
              sub={totalDefs ? `${Math.round((passed / totalDefs) * 100)}% 完成` : '尚無缺失'}
            />
            <StatTopBar
              tone="sage"
              icon={<Eye size={20} />}
              primary={`${submitted}`}
              label="待委員審查"
              sub={submitted > 0 ? '已送審項目' : '無待審'}
            />
            <StatTopBar
              tone="warning"
              icon={<ClipboardCheck size={20} />}
              primary={`${toFill}`}
              label="待填報"
              sub={toFill > 0 ? '機關尚未送審' : '全部已送'}
            />
            <StatTopBar
              tone="danger"
              icon={<AlertCircle size={20} />}
              primary={`${returned}`}
              label="退回補正"
              sub={returned > 0 ? '需儘速處理' : '無退回'}
            />
          </section>

          <section className="grid grid-cols-1 lg:grid-cols-5 gap-5 mb-10">
            {/* 週期清單 */}
            <Card className="lg:col-span-3" variant="elevated">
              <div className="flex items-baseline justify-between mb-4">
                <CardTitle className="text-title-lg">
                  {user.role === 'SUPER_ADMIN' ? '全部稽核週期' : '我的稽核週期'}
                </CardTitle>
                <Link href="/cycles" className="text-caption text-primary-700 hover:underline">
                  查看全部
                </Link>
              </div>
              <div className="flex flex-col gap-3">
                {cycles.slice(0, 5).map((c) => {
                  const t = c.deficiencies.length;
                  const p = c.deficiencies.filter((d) => d.action?.status === 'PASSED').length;
                  return (
                    <Link key={c.id} href={`/cycles/${c.id}`}>
                      <div className="group rounded-md border border-outline-variant hover:border-outline hover:bg-surface-container transition-colors p-4">
                        <div className="flex items-center justify-between gap-3 mb-2.5">
                          <p className="text-body-sm font-medium text-on-surface truncate">
                            {c.year - 1911} 年度 · {c.organization.name}
                          </p>
                          <Chip tone={cycleStatusTone(c.status as CycleStatus)} size="sm" dot>
                            {CYCLE_STATUS_LABELS[c.status as CycleStatus]}
                          </Chip>
                        </div>
                        {t > 0 ? (
                          <>
                            <ProgressBar value={p} max={t} tone="primary" size="sm" />
                            <div className="mt-1.5 flex justify-between text-caption text-on-surface-variant">
                              <span>矯正通過 <span className="tabular-nums font-medium text-on-surface">{p}</span> / {t}</span>
                              <span className="tabular-nums">{Math.round((p / t) * 100)}%</span>
                            </div>
                          </>
                        ) : (
                          <p className="text-caption text-on-surface-variant">尚未發布缺失</p>
                        )}
                      </div>
                    </Link>
                  );
                })}
              </div>
            </Card>

            {/* 待辦 */}
            <Card className="lg:col-span-2" variant="elevated">
              <div className="flex items-center justify-between mb-4">
                <CardTitle className="text-title-lg">待辦</CardTitle>
                <span className="text-caption text-on-surface-variant">按緊急度排序</span>
              </div>
              <div className="flex flex-col gap-1">
                {todos.length === 0 ? (
                  <div className="flex flex-col items-center text-center py-8 px-2">
                    <div className="w-14 h-14 rounded-full bg-success-50 text-success-600 flex items-center justify-center mb-3">
                      <CheckCircle size={26} />
                    </div>
                    <p className="text-title text-on-surface">{EMPTY.noTodos.title}</p>
                    <p className="text-caption text-on-surface-variant mt-1">{EMPTY.noTodos.description}</p>
                  </div>
                ) : (
                  todos.map((t) => (
                    <Link
                      key={t.key}
                      href={t.href}
                      className="group relative flex items-center gap-3 rounded-sm px-3 py-3 hover:bg-surface-container transition-colors duration-200 ease-standard focus-ring"
                    >
                      <span
                        className={
                          'w-2 h-2 rounded-full shrink-0 ' +
                          {
                            warning: 'bg-warning-500',
                            primary: 'bg-primary-500',
                            sage: 'bg-sage-500',
                            neutral: 'bg-neutral-500',
                            danger: 'bg-danger-500',
                          }[t.tone]
                        }
                        aria-hidden
                      />
                      <span className="flex-1 text-body-sm text-on-surface truncate">{t.title}</span>
                      <span className="text-caption text-on-surface-variant group-hover:text-primary-700 shrink-0 inline-flex items-center gap-0.5 transition-colors">
                        {t.cta}
                        <ChevronRight size={14} />
                      </span>
                    </Link>
                  ))
                )}
              </div>

              {user.role === 'SUPER_ADMIN' && (
                <div className="mt-5 pt-4 border-t border-outline-variant flex gap-2 flex-wrap">
                  <Link href="/admin/cycles">
                    <Button size="sm" variant="tonal">開立稽核週期</Button>
                  </Link>
                  <Link href="/admin/organizations">
                    <Button size="sm" variant="text">醫院管理</Button>
                  </Link>
                </div>
              )}
            </Card>
          </section>
        </>
      )}
    </AppShell>
  );
}

function StatTopBar({
  tone,
  icon,
  primary,
  label,
  sub,
}: {
  tone: 'primary' | 'success' | 'warning' | 'danger' | 'sage' | 'tertiary';
  icon: React.ReactNode;
  primary: string;
  label: string;
  sub: string;
}) {
  const bar = {
    primary: 'bg-primary-500',
    success: 'bg-success-500',
    warning: 'bg-warning-500',
    danger: 'bg-danger-500',
    sage: 'bg-sage-500',
    tertiary: 'bg-tertiary-500',
  }[tone];
  const iconBg = {
    primary: 'bg-primary-50 text-primary-700',
    success: 'bg-success-50 text-success-700',
    warning: 'bg-warning-50 text-warning-700',
    danger: 'bg-danger-50 text-danger-700',
    sage: 'bg-sage-50 text-sage-700',
    tertiary: 'bg-tertiary-50 text-tertiary-700',
  }[tone];

  return (
    <div className="relative bg-surface-container-lowest rounded-md shadow-elev-1 overflow-hidden border border-outline-variant/60">
      <div className={`h-1 ${bar}`} aria-hidden />
      <div className="p-5 flex items-center gap-4">
        <div className={`w-11 h-11 rounded-full flex items-center justify-center shrink-0 ${iconBg}`}>
          {icon}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-2">
            <span className="text-headline-sm font-semibold text-on-surface tabular-nums">{primary}</span>
          </div>
          <div className="mt-0.5 text-body-sm text-on-surface font-medium">{label}</div>
          <div className="text-caption text-on-surface-variant mt-0.5 truncate">{sub}</div>
        </div>
      </div>
    </div>
  );
}
