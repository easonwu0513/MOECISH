import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { prisma } from '@/lib/db';
import { auth } from '@/lib/auth';
import { AppShell } from '@/components/shell/AppShell';
import { Card } from '@/components/ui/Card';
import { Chip } from '@/components/ui/Chip';
import { EmptyState } from '@/components/ui/EmptyState';
import { AlertTriangle, ChevronRight } from '@/components/icons';
import {
  DEFICIENCY_ASPECT_LABELS,
  DEFICIENCY_TYPE_LABELS,
  ACTION_STATUS_LABELS,
  type DeficiencyAspect,
  type DeficiencyType,
  type ActionStatus,
} from '@/lib/types';
import { actionStatusTone } from '@/lib/state-machine';
import { EMPTY } from '@/lib/copy';
import AdminDeficiencyTools from './AdminDeficiencyTools';

export default async function DeficienciesPage({ params }: { params: { id: string } }) {
  const session = await auth();
  if (!session) redirect(`/login?callbackUrl=/cycles/${params.id}/deficiencies`);
  const user = session.user;

  const cycle = await prisma.auditCycle.findUnique({
    where: { id: params.id },
    include: {
      organization: true,
      assignments: true,
      deficiencies: {
        include: { action: { select: { status: true, round: true } } },
        orderBy: [{ aspect: 'asc' }, { type: 'asc' }, { itemNo: 'asc' }],
      },
    },
  });
  if (!cycle) notFound();

  // 存取控制
  if (user.role === 'ORG_ADMIN' && cycle.organizationId !== user.organizationId) redirect('/');
  if (user.role === 'AUDITOR' && !cycle.assignments.some((a) => a.auditorId === user.id)) redirect('/');

  const yearROC = cycle.year - 1911;
  const aspects: DeficiencyAspect[] = ['STRATEGY', 'MANAGEMENT', 'TECHNICAL'];
  const aspectNumber: Record<DeficiencyAspect, string> = {
    STRATEGY: '一', MANAGEMENT: '二', TECHNICAL: '三',
  };

  const total = cycle.deficiencies.length;
  const passed = cycle.deficiencies.filter((d) => d.action?.status === 'PASSED').length;
  const submitted = cycle.deficiencies.filter((d) => d.action?.status === 'SUBMITTED').length;
  const returned = cycle.deficiencies.filter((d) => d.action?.status === 'RETURNED').length;

  return (
    <AppShell
      user={{ name: user.name, email: user.email, role: user.role, organizationName: user.organizationName }}
      cycleId={cycle.id}
      crumbs={[
        { label: '總覽', href: '/' },
        { label: '稽核週期', href: '/cycles' },
        { label: `${yearROC} 年度 · ${cycle.organization.name}`, href: `/cycles/${cycle.id}` },
        { label: '缺失與矯正' },
      ]}
    >
      <header className="mb-6 flex items-start justify-between gap-4 flex-wrap">
        <div className="min-w-0">
          <h1 className="text-headline text-on-surface">缺失與矯正管考</h1>
          <p className="mt-1 text-body text-on-surface-variant">
            {yearROC} 年度 · {cycle.organization.name} · 共 {total} 項
            {total > 0 && (
              <>
                {' '}· 通過 <span className="tabular-nums font-medium text-success-700">{passed}</span>
                {submitted > 0 && <> · 待審 <span className="tabular-nums font-medium text-sage-700">{submitted}</span></>}
                {returned > 0 && <> · 退回 <span className="tabular-nums font-medium text-danger-700">{returned}</span></>}
              </>
            )}
          </p>
        </div>
        {user.role === 'SUPER_ADMIN' && cycle.status !== 'CLOSED' && (
          <AdminDeficiencyTools cycleId={cycle.id} cycleStatus={cycle.status} />
        )}
      </header>

      {total === 0 ? (
        <Card variant="outlined" padded={false}>
          <div className="p-6">
            <EmptyState
              icon={<AlertTriangle size={28} />}
              title={EMPTY.noDeficiencies.title}
              description={
                user.role === 'SUPER_ADMIN'
                  ? '使用右上角「新增缺失」逐筆建立，或「Excel 匯入」一次帶入教育部範本。'
                  : EMPTY.noDeficiencies.description
              }
            />
          </div>
        </Card>
      ) : (
        <div className="flex flex-col gap-8">
          {aspects.map((aspect) => {
            const inAspect = cycle.deficiencies.filter((d) => d.aspect === aspect);
            if (inAspect.length === 0) return null;
            const types: DeficiencyType[] = ['IMPROVE', 'SUGGEST'];
            return (
              <section key={aspect}>
                <h2 className="text-title-lg text-on-surface mb-4">
                  {aspectNumber[aspect]}、實地稽核－{DEFICIENCY_ASPECT_LABELS[aspect]}
                </h2>
                <div className="flex flex-col gap-5">
                  {types.map((type) => {
                    const items = inAspect.filter((d) => d.type === type);
                    if (items.length === 0) return null;
                    return (
                      <div key={type}>
                        <p className="text-label text-on-surface-variant mb-2">
                          {DEFICIENCY_TYPE_LABELS[type]}（{items.length} 項）
                        </p>
                        <div className="flex flex-col gap-2">
                          {items.map((d) => {
                            const status = (d.action?.status ?? 'PENDING') as ActionStatus;
                            const round = d.action?.round ?? 1;
                            return (
                              <Link key={d.id} href={`/cycles/${cycle.id}/deficiencies/${d.id}`}>
                                <Card interactive padded={false}>
                                  <div className="flex items-center gap-4 p-4 sm:p-5">
                                    <span className="w-9 h-9 rounded-md bg-surface-container flex items-center justify-center text-title text-on-surface-variant tabular-nums shrink-0">
                                      {d.itemNo}
                                    </span>
                                    <div className="flex-1 min-w-0">
                                      <p className="text-body-sm text-on-surface line-clamp-2">
                                        {d.description}
                                      </p>
                                      <div className="mt-1.5 flex items-center gap-2">
                                        {d.checklistRef && (
                                          <span className="text-caption font-mono text-on-surface-variant">
                                            檢核項 {d.checklistRef}
                                          </span>
                                        )}
                                        {round > 1 && (
                                          <span className="text-caption text-on-surface-variant">
                                            第 {round} 輪
                                          </span>
                                        )}
                                      </div>
                                    </div>
                                    <Chip tone={actionStatusTone(status)} size="sm" dot>
                                      {ACTION_STATUS_LABELS[status]}
                                    </Chip>
                                    <ChevronRight size={16} className="text-on-surface-variant shrink-0" />
                                  </div>
                                </Card>
                              </Link>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </section>
            );
          })}
        </div>
      )}
    </AppShell>
  );
}
