import Link from 'next/link';
import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { AppShell } from '@/components/shell/AppShell';
import { Card } from '@/components/ui/Card';
import { Chip } from '@/components/ui/Chip';
import { ProgressBar } from '@/components/ui/ProgressBar';
import { EmptyState } from '@/components/ui/EmptyState';
import { ClipboardCheck } from '@/components/icons';
import { CYCLE_STATUS_LABELS, cycleStatusTone } from '@/lib/state-machine';
import { parseAssignDimensions, ASSIGN_ASPECT_LABELS } from '@/lib/audit-score';
import type { CycleStatus } from '@/lib/types';
import { EMPTY } from '@/lib/copy';
import { fmtROC } from '@/lib/date';
import { cn } from '@/lib/cn';
import { DeadlineChip } from '@/components/cycle/DeadlineChip';

// 委員/機關清單依登入者即時查詢(含新指派的週期),不可被靜態快取
export const dynamic = 'force-dynamic';

export default async function CyclesPage({ searchParams }: { searchParams: { year?: string } }) {
  const session = await auth();
  if (!session) redirect('/login?callbackUrl=/cycles');
  const user = session.user;

  const where =
    user.role === 'ORG_ADMIN'
      ? { organizationId: user.organizationId ?? '__none__' }
      : user.role === 'AUDITOR'
      // 委員不顯示開立中(DRAFT)週期(對齊 access-policy 'cycle.access';dashboard 同步)
      ? { assignments: { some: { auditorId: user.id } }, status: { not: 'DRAFT' } }
      : {};

  const cycles = await prisma.auditCycle.findMany({
    where,
    include: {
      organization: true,
      deficiencies: { select: { id: true, action: { select: { status: true } } } },
      // 委員視角:帶出本人於各週期受指派的構面(卡片標註負責構面);其他角色查無、回空陣列
      assignments: { where: { auditorId: user.id }, select: { dimensions: true } },
    },
    orderBy: [{ year: 'desc' }, { createdAt: 'desc' }],
  });

  // 年度做成頁籤分類(取代標題上的年度);民國年呈現
  const years = [...new Set(cycles.map((c) => c.year))].sort((a, b) => b - a);
  const selYear = searchParams.year && years.includes(Number(searchParams.year)) ? Number(searchParams.year) : null;
  const shown = selYear ? cycles.filter((c) => c.year === selYear) : cycles;

  const yearTab = (active: boolean) =>
    cn(
      'inline-flex items-center min-h-9 px-3.5 rounded-full text-label-lg focus-ring transition-colors tabular-nums',
      active ? 'bg-primary-container text-on-primary-container font-medium' : 'text-on-surface-variant hover:bg-surface-container',
    );

  return (
    <AppShell
      user={{ name: user.name, email: user.email, role: user.role, organizationName: user.organizationName }}
      crumbs={[{ label: '總覽', href: '/dashboard' }, { label: '稽核週期' }]}
    >
      <header className="mb-4 flex items-baseline justify-between">
        <h1 className="text-headline text-on-surface">稽核週期</h1>
        <span className="text-caption text-on-surface-variant">共 {shown.length} 筆</span>
      </header>

      {years.length > 0 && (
        <div className="mb-6 flex items-center gap-2 flex-wrap">
          <span className="text-caption text-on-surface-variant mr-0.5">年度</span>
          <Link href="/cycles" aria-current={selYear === null ? 'page' : undefined} className={yearTab(selYear === null)}>
            全部
          </Link>
          {years.map((y) => (
            <Link key={y} href={`/cycles?year=${y}`} aria-current={selYear === y ? 'page' : undefined} className={yearTab(selYear === y)}>
              {y - 1911}
            </Link>
          ))}
        </div>
      )}

      {shown.length === 0 ? (
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
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {shown.map((c) => {
            const total = c.deficiencies.length;
            const passed = c.deficiencies.filter((d) => d.action?.status === 'PASSED').length;
            const orgName = c.organization.shortName?.trim() || c.organization.name;
            const auditorDims = user.role === 'AUDITOR'
              ? parseAssignDimensions(c.assignments?.[0]?.dimensions).map((d) => ASSIGN_ASPECT_LABELS[d])
              : [];
            return (
              <Link key={c.id} href={`/cycles/${c.id}`}>
                <Card interactive variant="elevated">
                  <div className="flex items-center justify-between gap-3 mb-4">
                    <div className="min-w-0">
                      <p className="text-title text-on-surface truncate" title={c.organization.name}>
                        {orgName}
                      </p>
                      <p className="text-caption text-on-surface-variant mt-1">
                        {c.dueDate ? `矯正截止 ${fmtROC(c.dueDate)}` : '尚未設定矯正截止日期'}
                      </p>
                      {auditorDims.length > 0 && (
                        <p className="text-caption text-primary-700 mt-1">負責構面:{auditorDims.join('、')}</p>
                      )}
                    </div>
                    <div className="flex flex-col items-end gap-1.5 shrink-0">
                      <Chip tone={cycleStatusTone(c.status as CycleStatus)} size="sm" dot>
                        {CYCLE_STATUS_LABELS[c.status as CycleStatus]}
                      </Chip>
                      <DeadlineChip status={c.status} dueDate={c.dueDate} allPassed={total > 0 && passed === total} />
                    </div>
                  </div>
                  {total > 0 ? (
                    <>
                      <ProgressBar value={passed} max={total} tone="primary" size="sm" />
                      <div className="mt-2 flex items-center justify-between text-caption">
                        <span className="text-on-surface-variant">
                          矯正通過{' '}
                          <span className="font-semibold text-on-surface tabular-nums">{passed}</span>
                          <span> / {total}</span>
                        </span>
                        <span className="text-on-surface-variant tabular-nums">
                          {Math.round((passed / total) * 100)}%
                        </span>
                      </div>
                    </>
                  ) : (
                    <p className="text-caption text-on-surface-variant">尚未發布缺失</p>
                  )}
                </Card>
              </Link>
            );
          })}
        </div>
      )}
    </AppShell>
  );
}
