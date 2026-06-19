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
import type { CycleStatus } from '@/lib/types';
import { EMPTY } from '@/lib/copy';

export default async function CyclesPage() {
  const session = await auth();
  if (!session) redirect('/login?callbackUrl=/cycles');
  const user = session.user;

  const where =
    user.role === 'ORG_ADMIN'
      ? { organizationId: user.organizationId ?? '__none__' }
      : user.role === 'AUDITOR'
      ? { assignments: { some: { auditorId: user.id } } }
      : {};

  const cycles = await prisma.auditCycle.findMany({
    where,
    include: {
      organization: true,
      deficiencies: { select: { id: true, action: { select: { status: true } } } },
    },
    orderBy: [{ year: 'desc' }, { createdAt: 'desc' }],
  });

  return (
    <AppShell
      user={{ name: user.name, email: user.email, role: user.role, organizationName: user.organizationName }}
      crumbs={[{ label: '總覽', href: '/dashboard' }, { label: '稽核週期' }]}
    >
      <header className="mb-6 flex items-baseline justify-between">
        <h1 className="text-headline text-on-surface">稽核週期</h1>
        <span className="text-caption text-on-surface-variant">共 {cycles.length} 筆</span>
      </header>

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
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {cycles.map((c) => {
            const total = c.deficiencies.length;
            const passed = c.deficiencies.filter((d) => d.action?.status === 'PASSED').length;
            return (
              <Link key={c.id} href={`/cycles/${c.id}`}>
                <Card interactive variant="elevated">
                  <div className="flex items-center justify-between gap-3 mb-4">
                    <div className="min-w-0">
                      <p className="text-title text-on-surface truncate">
                        {c.year - 1911} 年度 · {c.organization.name}
                      </p>
                      <p className="text-caption text-on-surface-variant mt-1">
                        矯正截止 {new Date(c.dueDate).toLocaleDateString('zh-TW')}
                      </p>
                    </div>
                    <Chip tone={cycleStatusTone(c.status as CycleStatus)} size="sm" dot>
                      {CYCLE_STATUS_LABELS[c.status as CycleStatus]}
                    </Chip>
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
