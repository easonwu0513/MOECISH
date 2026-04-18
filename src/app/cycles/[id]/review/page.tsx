import { notFound, redirect } from 'next/navigation';
import { prisma } from '@/lib/db';
import { auth } from '@/lib/auth';
import { AppShell } from '@/components/shell/AppShell';
import { Card } from '@/components/ui/Card';
import { Chip } from '@/components/ui/Chip';
import { EmptyState } from '@/components/ui/EmptyState';
import { ClipboardCheck } from '@/components/icons';
import { DIMENSION_LABELS, DIMENSION_ORDER } from '@/lib/dimension';
import { COMPLIANCE_LABELS, type ComplianceLevel, type Dimension } from '@/lib/types';
import CommentForm from './CommentForm';

const complianceTone: Record<ComplianceLevel, 'success' | 'warning' | 'danger' | 'neutral'> = {
  COMPLIANT: 'success',
  PARTIALLY_COMPLIANT: 'warning',
  NON_COMPLIANT: 'danger',
  NOT_APPLICABLE: 'neutral',
};

export default async function ReviewPage({ params }: { params: { id: string } }) {
  const session = await auth();
  if (!session) redirect(`/login?callbackUrl=/cycles/${params.id}/review`);
  if (session.user.role !== 'AUDITOR' && session.user.role !== 'ADMIN') {
    redirect(`/cycles/${params.id}`);
  }

  const cycle = await prisma.auditCycle.findUnique({
    where: { id: params.id },
    include: {
      organization: true,
      checklistVersion: { include: { items: { orderBy: { orderIndex: 'asc' } } } },
      responses: { include: { comments: { orderBy: { createdAt: 'asc' } } } },
    },
  });
  if (!cycle) notFound();

  const responsesByItem = new Map(cycle.responses.map((r) => [r.checklistItemId, r]));
  const grouped = DIMENSION_ORDER.map((dim) => ({
    dim,
    items: cycle.checklistVersion.items.filter((i) => i.dimension === dim),
  }));

  const total = cycle.checklistVersion.items.length;
  const answered = cycle.responses.filter((r) => r.compliance).length;

  return (
    <AppShell
      user={{
        name: session.user.name,
        email: session.user.email,
        role: session.user.role,
        organizationName: session.user.organizationName,
      }}
      cycleId={cycle.id}
      crumbs={[
        { label: '總覽', href: '/' },
        { label: `${cycle.year - 1911} 年度`, href: `/cycles/${cycle.id}` },
        { label: '委員審閱' },
      ]}
    >
      <header className="mb-5">
        <h1 className="text-headline text-neutral-900">委員審閱</h1>
        <p className="text-body-sm text-neutral-500 mt-1">
          {cycle.organization.name} · 已作答 {answered} / {total} 題 · 狀態 {cycle.status}
        </p>
      </header>

      {answered === 0 ? (
        <Card>
          <EmptyState
            icon={<ClipboardCheck size={28} />}
            title="機關尚未開始填答"
            description="等受稽機關至少完成一題後，才能在此留下委員意見。"
          />
        </Card>
      ) : (
        grouped.map(({ dim, items }) => (
          <section key={dim} className="mb-6">
            <div className="flex items-center gap-2 mb-3">
              <h2 className="text-title text-neutral-900">{DIMENSION_LABELS[dim as Dimension]}</h2>
              <Chip tone="neutral" size="sm">{items.length}</Chip>
            </div>
            <div className="flex flex-col gap-2.5">
              {items.map((item) => {
                const r = responsesByItem.get(item.id);
                const c = r?.compliance as ComplianceLevel | null;
                return (
                  <Card key={item.id} elevation={0} className="border-neutral-200">
                    <div className="flex items-start gap-3">
                      <Chip tone="sage" size="sm" className="font-mono shrink-0 mt-0.5">{item.itemNo}</Chip>
                      <div className="flex-1 min-w-0">
                        <p className="text-body text-neutral-900 leading-relaxed">{item.content}</p>
                        <div className="mt-2 flex items-center gap-1.5 flex-wrap">
                          {c ? (
                            <Chip tone={complianceTone[c]} size="sm" dot>
                              {COMPLIANCE_LABELS[c]}
                            </Chip>
                          ) : (
                            <Chip tone="neutral" size="sm">未作答</Chip>
                          )}
                          {(r?.comments ?? []).filter((x) => !x.resolvedAt).length > 0 && (
                            <Chip tone="warning" size="sm">
                              意見待補 {(r!.comments).filter((x) => !x.resolvedAt).length}
                            </Chip>
                          )}
                        </div>
                        {r?.description && (
                          <div className="mt-3 rounded-md bg-neutral-50 border border-neutral-100 p-3 text-body-sm text-neutral-700 whitespace-pre-wrap">
                            {r.description}
                          </div>
                        )}

                        {r && r.comments.length > 0 && (
                          <div className="mt-3 space-y-2">
                            {r.comments.map((cm) => (
                              <div
                                key={cm.id}
                                className={
                                  'rounded-md p-3 border text-body-sm ' +
                                  (cm.resolvedAt
                                    ? 'bg-success-50 border-success-100'
                                    : 'bg-warning-50 border-warning-100')
                                }
                              >
                                <div className="text-caption text-neutral-500 mb-1 flex items-center gap-2">
                                  <span>第 {cm.round} 輪 · {new Date(cm.createdAt).toLocaleString('zh-TW')}</span>
                                  {cm.resolvedAt && <Chip tone="success" size="sm">已補正</Chip>}
                                </div>
                                <p className="whitespace-pre-wrap text-neutral-800">{cm.content}</p>
                              </div>
                            ))}
                          </div>
                        )}

                        {r ? (
                          <div className="mt-3">
                            <CommentForm responseId={r.id} />
                          </div>
                        ) : (
                          <p className="mt-2 text-caption text-neutral-400">（填報人尚未作答，暫無法留言）</p>
                        )}
                      </div>
                    </div>
                  </Card>
                );
              })}
            </div>
          </section>
        ))
      )}
    </AppShell>
  );
}
