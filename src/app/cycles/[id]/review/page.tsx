import { notFound, redirect } from 'next/navigation';
import { prisma } from '@/lib/db';
import { auth } from '@/lib/auth';
import { AppShell } from '@/components/shell/AppShell';
import { Card } from '@/components/ui/Card';
import { Chip } from '@/components/ui/Chip';
import { EmptyState } from '@/components/ui/EmptyState';
import { ClipboardCheck } from '@/components/icons';
import { DIMENSION_LABELS, DIMENSION_ORDER } from '@/lib/dimension';
import { COMPLIANCE_LABELS, COMPLIANCE_TONE, type ComplianceLevel, type Dimension, type CycleStatus } from '@/lib/types';
import { CYCLE_STATUS_LABELS } from '@/lib/state-machine';
import { LawPanel } from '@/components/checklist/LawBasis';
import { FilterChipLink, FilterChipCount } from '@/components/ui/FilterChip';
import CommentForm from './CommentForm';
import SubmissionBanner from '../checklist/SubmissionBanner';

const complianceTone = COMPLIANCE_TONE;

export default async function ReviewPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams: { filter?: string };
}) {
  const session = await auth();
  if (!session) redirect(`/login?callbackUrl=/cycles/${params.id}/review`);
  if (session.user.role !== 'AUDITOR' && session.user.role !== 'SUPER_ADMIN') {
    redirect(`/cycles/${params.id}`);
  }

  const cycle = await prisma.auditCycle.findUnique({
    where: { id: params.id },
    include: {
      organization: true,
      assignments: true,
      checklistVersion: { include: { items: { orderBy: { orderIndex: 'asc' } } } },
      responses: { include: { comments: { orderBy: { createdAt: 'asc' } } } },
    },
  });
  if (!cycle) notFound();

  // 委員僅能進入被指派的週期(與缺失頁一致)
  if (
    session.user.role === 'AUDITOR' &&
    !cycle.assignments.some((a) => a.auditorId === session.user.id)
  ) {
    redirect('/dashboard');
  }

  const responsesByItem = new Map(cycle.responses.map((r) => [r.checklistItemId, r]));

  const total = cycle.checklistVersion.items.length;
  const answered = cycle.responses.filter((r) => r.compliance).length;
  const withOpenComments = cycle.checklistVersion.items.filter((i) => {
    const r = responsesByItem.get(i.id);
    return (r?.comments ?? []).some((c) => !c.resolvedAt);
  }).length;

  // 篩選:answered=只看已作答、comments=只看意見待補(87 題全平鋪對委員掃讀太沉重)
  const filter = searchParams.filter === 'answered' || searchParams.filter === 'comments' ? searchParams.filter : null;
  const matchFilter = (itemId: string) => {
    const r = responsesByItem.get(itemId);
    if (filter === 'answered') return Boolean(r?.compliance);
    if (filter === 'comments') return (r?.comments ?? []).some((c) => !c.resolvedAt);
    return true;
  };
  const grouped = DIMENSION_ORDER.map((dim) => ({
    dim,
    items: cycle.checklistVersion.items.filter((i) => i.dimension === dim && matchFilter(i.id)),
  })).filter((g) => g.items.length > 0);

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
        { label: '總覽', href: '/dashboard' },
        { label: `${cycle.year - 1911} 年度`, href: `/cycles/${cycle.id}` },
        { label: '委員審閱' },
      ]}
    >
      <header className="mb-5">
        <h1 className="text-headline text-neutral-900">委員審閱</h1>
        <p className="text-body-sm text-neutral-500 mt-1">
          {cycle.organization.name} · 已作答 {answered} / {total} 題 · {CYCLE_STATUS_LABELS[cycle.status as CycleStatus]}
        </p>
      </header>

      <SubmissionBanner
        cycleId={cycle.id}
        submittedAtISO={cycle.checklistSubmittedAt?.toISOString() ?? null}
        submittedBy={cycle.checklistSubmittedBy}
        reopenNote={null}
        canReopen
      />

      {/* 篩選 */}
      {answered > 0 && (
        <div className="mb-5 flex items-center gap-2 flex-wrap">
          <FilterChipLink href={`/cycles/${cycle.id}/review`} selected={!filter}>
            全部 <FilterChipCount selected={!filter}>{total}</FilterChipCount>
          </FilterChipLink>
          <FilterChipLink href={`/cycles/${cycle.id}/review?filter=answered`} selected={filter === 'answered'}>
            只看已作答 <FilterChipCount selected={filter === 'answered'}>{answered}</FilterChipCount>
          </FilterChipLink>
          {withOpenComments > 0 && (
            <FilterChipLink href={`/cycles/${cycle.id}/review?filter=comments`} selected={filter === 'comments'}>
              意見待補 <FilterChipCount selected={filter === 'comments'}>{withOpenComments}</FilterChipCount>
            </FilterChipLink>
          )}
        </div>
      )}

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
              <h2 className="text-title-md text-on-surface">{DIMENSION_LABELS[dim as Dimension]}</h2>
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
                            <p className="text-caption font-medium text-neutral-500 mb-1">機關說明(規範內容、執行方式、執行結果)</p>
                            {r.description}
                          </div>
                        )}
                        {r?.recordDocs && (
                          <div className="mt-2 rounded-md bg-neutral-50 border border-neutral-100 p-3 text-body-sm text-neutral-700 whitespace-pre-wrap">
                            <p className="text-caption font-medium text-neutral-500 mb-1">紀錄文件</p>
                            {r.recordDocs}
                          </div>
                        )}

                        {/* 法規對照:委員審查時即時對照稽核依據 */}
                        {(item.auditBasis || item.auditFocus || item.expectedEvidence) && (
                          <details className="mt-3 rounded-md border border-primary-100 bg-primary-50/40 overflow-hidden">
                            <summary className="cursor-pointer select-none px-3 py-2 text-body-sm font-medium text-primary-800 hover:bg-primary-50 transition-colors">
                              法規對照(稽核依據・稽核重點・佐證資料)
                            </summary>
                            <div className="px-3 pb-3 pt-1 bg-white">
                              <LawPanel
                                auditBasis={item.auditBasis}
                                auditFocus={item.auditFocus}
                                expectedEvidence={item.expectedEvidence}
                              />
                            </div>
                          </details>
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
