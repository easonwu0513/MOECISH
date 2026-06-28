import { notFound, redirect } from 'next/navigation';
import { prisma } from '@/lib/db';
import { auth } from '@/lib/auth';
import { fmtROCDateTime } from '@/lib/date';
import { AppShell } from '@/components/shell/AppShell';
import { Card } from '@/components/ui/Card';
import { Chip } from '@/components/ui/Chip';
import { EmptyState } from '@/components/ui/EmptyState';
import { ClipboardCheck } from '@/components/icons';
import { ProtectedFileLink } from '@/components/cycle/ProtectedFileLink';
import { DIMENSION_LABELS, DIMENSION_ORDER } from '@/lib/dimension';
import { COMPLIANCE_LABELS, COMPLIANCE_TONE, auditorCanViewChecklistContent, type ComplianceLevel, type Dimension, type CycleStatus } from '@/lib/types';
import { CYCLE_STATUS_LABELS } from '@/lib/state-machine';
import { LawPanel } from '@/components/checklist/LawBasis';
import { FilterChipLink, FilterChipCount } from '@/components/ui/FilterChip';
import CommentForm from './CommentForm';
import SubmissionBanner from '../checklist/SubmissionBanner';
import ReviewReopenBar from './ReviewReopenBar';

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
      checklistVersion: { include: { items: { orderBy: { orderIndex: 'asc' } } } },
      responses: { include: { comments: { orderBy: { createdAt: 'asc' } } } },
      assignments: { include: { auditor: { select: { id: true, name: true } } } },
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
  // 委員一律於週期進入「資料齊備」後才可審閱機關檢核表(開立中/資料準備中不開放)
  if (session.user.role === 'AUDITOR' && !auditorCanViewChecklistContent(cycle.status)) {
    redirect('/dashboard');
  }

  const responsesByItem = new Map(cycle.responses.map((r) => [r.checklistItemId, r]));

  // 委員意見作者(本頁僅委員/中心可進入,皆可具名顯示;受稽機關端不具名)
  const commentAuthorIds = Array.from(new Set(cycle.responses.flatMap((r) => r.comments.map((c) => c.auditorId))));
  const authorNameById: Record<string, string> = {};
  if (commentAuthorIds.length) {
    const authors = await prisma.user.findMany({ where: { id: { in: commentAuthorIds } }, select: { id: true, name: true } });
    for (const a of authors) authorNameById[a.id] = a.name;
  }

  // 佐證檔案:委員需看附件才能判定符合度(沿用 evidences 下載授權)
  const evidenceList = await prisma.evidence.findMany({
    where: { targetType: 'CHECKLIST_RESPONSE', targetId: { in: cycle.responses.map((r) => r.id) } },
    select: { id: true, targetId: true, originalName: true, sizeBytes: true },
    orderBy: { uploadedAt: 'asc' },
  });
  const evidenceByResponse = new Map<string, typeof evidenceList>();
  for (const e of evidenceList) {
    const arr = evidenceByResponse.get(e.targetId) ?? [];
    arr.push(e);
    evidenceByResponse.set(e.targetId, arr);
  }

  const total = cycle.checklistVersion.items.length;
  const answered = cycle.responses.filter((r) => r.compliance).length;
  const withOpenComments = cycle.checklistVersion.items.filter((i) => {
    const r = responsesByItem.get(i.id);
    return (r?.comments ?? []).some((c) => !c.resolvedAt);
  }).length;
  // 已補正待複核:機關已對最新一輪意見標記補正,委員應再次檢視(免得自己逐題翻找)
  const resolvedPending = cycle.checklistVersion.items.filter((i) => {
    const cs = responsesByItem.get(i.id)?.comments ?? [];
    return cs.length > 0 && cs[cs.length - 1].resolvedAt != null;
  }).length;

  // 委員審閱完成進度(中心掌握);本委員是否已標記「意見填寫完成」
  const myReviewDone = Boolean(cycle.assignments.find((a) => a.auditorId === session.user.id)?.reviewDoneAt);
  const reviewDoneList = cycle.assignments.map((a) => ({ name: a.auditor?.name ?? '委員', done: Boolean(a.reviewDoneAt) }));
  const reviewDoneCount = reviewDoneList.filter((x) => x.done).length;

  // 篩選:answered=只看已作答、comments=意見待補、resolved=已補正待複核
  const filter =
    ['answered', 'comments', 'resolved'].includes(searchParams.filter ?? '')
      ? (searchParams.filter as 'answered' | 'comments' | 'resolved')
      : null;
  const matchFilter = (itemId: string) => {
    const r = responsesByItem.get(itemId);
    if (filter === 'answered') return Boolean(r?.compliance);
    if (filter === 'comments') return (r?.comments ?? []).some((c) => !c.resolvedAt);
    if (filter === 'resolved') {
      const cs = r?.comments ?? [];
      return cs.length > 0 && cs[cs.length - 1].resolvedAt != null;
    }
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
      watermark
      crumbs={[
        { label: '總覽', href: '/dashboard' },
        { label: `${cycle.year - 1911} 年度 · ${cycle.organization.name}`, href: `/cycles/${cycle.id}` },
        { label: '委員審閱' },
      ]}
    >
      <header className="mb-5">
        <h1 className="text-headline text-on-surface">委員審閱</h1>
        <p className="text-body-sm text-on-surface-variant mt-1 leading-relaxed">
          逐題檢視機關說明與佐證,於每題下方留意見;完成後按「意見填寫完成」通知中心(是否退回重填由中心決定)。
        </p>
        <p className="text-body-sm text-on-surface-variant mt-1">
          {cycle.organization.name} · {CYCLE_STATUS_LABELS[cycle.status as CycleStatus]}
          {/* 已作答 N/總 · 意見待補 N 由下方篩選 chip 承擔,header 不重述 */}
        </p>
      </header>

      <SubmissionBanner
        cycleId={cycle.id}
        submittedAtISO={cycle.checklistSubmittedAt?.toISOString() ?? null}
        submittedBy={cycle.checklistSubmittedBy}
        reopenNote={null}
        canReopen={session.user.role === 'SUPER_ADMIN'}
      />

      {/* 中心:委員審閱完成進度 */}
      {session.user.role === 'SUPER_ADMIN' && cycle.checklistSubmittedAt && reviewDoneList.length > 0 && (
        <div className="mb-5 rounded-md border border-outline-variant/60 bg-surface-container-lowest px-5 py-3">
          <p className="text-body-sm text-on-surface">
            委員審閱進度:<span className="font-semibold tabular-nums">{reviewDoneCount}</span> / {reviewDoneList.length} 已完成意見
          </p>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {reviewDoneList.map((x, i) => (
              <Chip key={i} tone={x.done ? 'success' : 'neutral'} size="sm" dot>
                {x.name}{x.done ? ' · 已完成' : ' · 審閱中'}
              </Chip>
            ))}
          </div>
        </div>
      )}

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
          {resolvedPending > 0 && (
            <FilterChipLink href={`/cycles/${cycle.id}/review?filter=resolved`} selected={filter === 'resolved'}>
              已補正待複核 <FilterChipCount selected={filter === 'resolved'}>{resolvedPending}</FilterChipCount>
            </FilterChipLink>
          )}
        </div>
      )}

      {answered === 0 ? (
        <Card>
          <EmptyState
            icon={<ClipboardCheck size={28} />}
            title="機關尚未開始填答"
            description="等機關至少完成一題後，才能在此留下委員意見。"
          />
        </Card>
      ) : (
        grouped.map(({ dim, items }) => (
          <section key={dim} className="mb-6">
            <div className="flex items-center gap-2 mb-3">
              <h2 className="text-title-md text-on-surface">{DIMENSION_LABELS[dim as Dimension]}</h2>
              <Chip tone="neutral" size="sm">{items.length}</Chip>
            </div>
            <div className="flex flex-col gap-3">
              {items.map((item) => {
                const r = responsesByItem.get(item.id);
                const c = r?.compliance as ComplianceLevel | null;
                return (
                  <Card key={item.id} variant="outlined">
                    <div className="flex items-start gap-3">
                      <Chip tone="sage" size="sm" className="font-mono shrink-0 mt-0.5">{item.itemNo}</Chip>
                      <div className="flex-1 min-w-0">
                        <p className="text-body text-on-surface leading-relaxed">{item.content}</p>
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
                          <div className="mt-3 rounded-md bg-surface-container border border-outline-variant/70 p-3 text-body-sm text-on-surface-variant leading-relaxed whitespace-pre-wrap">
                            <p className="text-caption font-medium text-on-surface-variant mb-1">機關說明(規範內容、執行方式、執行結果)</p>
                            {r.description}
                          </div>
                        )}
                        {r?.recordDocs && (
                          <div className="mt-2 rounded-md bg-surface-container border border-outline-variant/70 p-3 text-body-sm text-on-surface-variant leading-relaxed whitespace-pre-wrap">
                            <p className="text-caption font-medium text-on-surface-variant mb-1">紀錄文件</p>
                            {r.recordDocs}
                          </div>
                        )}
                        {r?.orgRevisionNote && (
                          <div className="mt-2 rounded-md bg-primary-50/50 border border-primary-100 p-3 text-body-sm text-primary-900 leading-relaxed whitespace-pre-wrap">
                            <p className="text-caption font-medium text-primary-800 mb-1">機關補正回應(針對委員意見)</p>
                            {r.orgRevisionNote}
                          </div>
                        )}
                        {r && (evidenceByResponse.get(r.id)?.length ?? 0) > 0 && (
                          <div className="mt-2 rounded-md bg-surface-container border border-outline-variant/70 p-3">
                            <p className="text-caption font-medium text-on-surface-variant mb-1.5">佐證檔案</p>
                            <ul className="space-y-1">
                              {evidenceByResponse.get(r.id)!.map((e) => (
                                <li key={e.id}>
                                  <ProtectedFileLink
                                    fileId={e.id}
                                    name={e.originalName}
                                    sizeKB={Math.max(1, Math.round(e.sizeBytes / 1024))}
                                    viewOnly={session.user.role === 'AUDITOR'}
                                  />
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}

                        {/* 法規對照:委員審查時即時對照稽核依據 */}
                        {(item.auditBasis || item.auditFocus || item.expectedEvidence) && (
                          <details className="mt-3 rounded-md border border-primary-100 bg-primary-50/40 overflow-hidden">
                            <summary className="cursor-pointer select-none px-3 py-2 text-body-sm font-medium text-primary-800 hover:bg-primary-50 transition-colors">
                              法規對照(稽核依據・稽核重點・應備文件)
                            </summary>
                            <div className="px-3 pb-3 pt-1 bg-surface-container-lowest">
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
                                <div className="text-caption text-on-surface-variant mb-1 flex items-center gap-2">
                                  <span>{authorNameById[cm.auditorId] ?? '委員'} · 第 {cm.round} 輪 · {fmtROCDateTime(cm.createdAt)}</span>
                                  {cm.resolvedAt && <Chip tone="success" size="sm">已補正</Chip>}
                                </div>
                                <p className="whitespace-pre-wrap text-on-surface-variant leading-relaxed">{cm.content}</p>
                              </div>
                            ))}
                          </div>
                        )}

                        {r ? (
                          <div className="mt-3">
                            <CommentForm responseId={r.id} />
                          </div>
                        ) : (
                          <p className="mt-2 text-caption text-on-surface-variant">（填報人尚未作答，暫無法留言）</p>
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

      {/* 審閱收尾:已送出且尚未結案時,委員可整批退回補正(接 checklist/reopen) */}
      {cycle.checklistSubmittedAt && cycle.status !== 'CLOSED' && (
        <ReviewReopenBar cycleId={cycle.id} role={session.user.role} openComments={withOpenComments} reviewDone={myReviewDone} />
      )}
    </AppShell>
  );
}
