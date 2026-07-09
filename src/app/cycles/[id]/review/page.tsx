import { notFound, redirect } from 'next/navigation';
import { prisma } from '@/lib/db';
import { auth } from '@/lib/auth';
import { fmtROCDateTime } from '@/lib/date';
import { AppShell } from '@/components/shell/AppShell';
import { Card } from '@/components/ui/Card';
import { Chip } from '@/components/ui/Chip';
import { EmptyState } from '@/components/ui/EmptyState';
import { ClipboardCheck, ChevronRight } from '@/components/icons';
import { ProtectedFileLink } from '@/components/cycle/ProtectedFileLink';
import { DIMENSION_LABELS, DIMENSION_ORDER } from '@/lib/dimension';
import { COMPLIANCE_LABELS, COMPLIANCE_TONE, auditorCanViewChecklistContent, reviewWindowStateForRole, type ComplianceLevel, type Dimension, type CycleStatus } from '@/lib/types';
import { ReviewWindowLockedPage } from '@/components/cycle/ReviewWindowLockedPage';
import { filterOwnComments } from '@/lib/auditor-visibility';
import { CycleHubBar } from '@/components/cycle/CycleHubBar';
import { CYCLE_STATUS_LABELS } from '@/lib/state-machine';
import { LawPanel } from '@/components/checklist/LawBasis';
import { NoteBox } from '@/components/cycle/NoteBox';
import { SURFACE_INFO } from '@/lib/tone';
import { FilterChipLink, FilterChipCount } from '@/components/ui/FilterChip';
import CommentForm from './CommentForm';
import ReviewNote from './ReviewNote';
import ObserverCommentSection from './ObserverCommentSection';
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
  if (session.user.role !== 'AUDITOR' && session.user.role !== 'SUPER_ADMIN' && session.user.role !== 'OBSERVER') {
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
  // 觀察員(批30):僅能進入被配對的週期(CycleObserver);唯讀審閱,不留意見
  if (session.user.role === 'OBSERVER') {
    const paired = await prisma.cycleObserver.findUnique({
      where: { cycleId_observerId: { cycleId: cycle.id, observerId: session.user.id } },
      select: { id: true },
    });
    if (!paired) redirect('/dashboard');
  }
  // 委員/觀察員一律於週期進入「資料齊備」後才可審閱機關檢核表(開立中/資料準備中不開放)
  if ((session.user.role === 'AUDITOR' || session.user.role === 'OBSERVER') && !auditorCanViewChecklistContent(cycle.status)) {
    redirect('/dashboard');
  }
  const isObserverView = session.user.role === 'OBSERVER';
  const pageTitle = isObserverView ? '檢核表審閱' : '委員審閱';
  // 審閱時間區間閘(UAT 批67;觀察員批30 查獨立窗口):不在窗口內(或未設)→ 早退顯鎖定頁,不載入任何機關資料
  const reviewState = reviewWindowStateForRole(session.user.role, cycle);
  if (reviewState !== 'open') {
    // 早退鎖定頁(共用殼,與 /checklist 一致;不載入機關資料)
    return <ReviewWindowLockedPage user={session.user} cycle={cycle} title={pageTitle} crumbLabel={pageTitle} state={reviewState} variant={isObserverView ? 'observer' : 'auditor'} />;
  }

  // 委員意見隱私(UAT 批62):委員僅見「自己」填寫的意見——各委員獨立審查,
  // 不互看彼此意見以免相互影響;中心仍可見全部具名意見。以下所有計數/篩選
  // (意見待補、已補正待複核)自然變成「以本人意見為準」。
  filterOwnComments(cycle.responses, session.user.role, session.user.id);

  const responsesByItem = new Map(cycle.responses.map((r) => [r.checklistItemId, r]));

  // 委員意見作者(本頁僅委員/中心可進入,皆可具名顯示;受稽機關端不具名)
  const commentAuthorIds = Array.from(new Set(cycle.responses.flatMap((r) => r.comments.map((c) => c.auditorId))));
  const authorNameById: Record<string, string> = {};
  if (commentAuthorIds.length) {
    const authors = await prisma.user.findMany({ where: { id: { in: commentAuthorIds } }, select: { id: true, name: true } });
    for (const a of authors) authorNameById[a.id] = a.name;
  }

  // 觀察員意見(批42):觀察員本人的逐題練習意見(獨立 PracticeComment 表;比照委員意見操作,
  // 僅本人/指導者/中心可見)。依 responseId 歸戶供題卡顯示與「觀察員意見」篩選。
  const practiceByResponse = new Map<string, { id: string; content: string; createdAt: Date }[]>();
  if (isObserverView) {
    const myPractice = await prisma.practiceComment.findMany({
      where: { responseId: { in: cycle.responses.map((r) => r.id) }, observerId: session.user.id },
      orderBy: { createdAt: 'asc' },
      select: { id: true, responseId: true, content: true, createdAt: true },
    });
    for (const c of myPractice) {
      const arr = practiceByResponse.get(c.responseId) ?? [];
      arr.push({ id: c.id, content: c.content, createdAt: c.createdAt });
      practiceByResponse.set(c.responseId, arr);
    }
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
  // 委員意見:委員審閱=留存筆記,故以「本委員留過意見的題目」計(不分待補/已補正),供快速回看已寫哪些。
  // 觀察員視角改計本人的觀察員意見(委員意見對觀察員一律清空)。
  const withComments = cycle.checklistVersion.items.filter((i) => {
    const r = responsesByItem.get(i.id);
    if (isObserverView) return r ? (practiceByResponse.get(r.id)?.length ?? 0) > 0 : false;
    return (r?.comments ?? []).length > 0;
  }).length;
  // 已補正待複核:機關已對最新一輪意見標記補正,委員應再次檢視(免得自己逐題翻找)
  const resolvedPending = cycle.checklistVersion.items.filter((i) => {
    const cs = responsesByItem.get(i.id)?.comments ?? [];
    return cs.length > 0 && cs[cs.length - 1].resolvedAt != null;
  }).length;

  // 篩選:answered=只看已作答、comments=委員意見(本委員留過意見的題)、resolved=已補正待複核、
  //       comply/partial/noncomply/na=依機關作答符合度快速篩選(委員可一鍵挑出某類)。
  const COMPLIANCE_FILTER = {
    comply: 'COMPLIANT', partial: 'PARTIALLY_COMPLIANT', noncomply: 'NON_COMPLIANT', na: 'NOT_APPLICABLE',
  } as const;
  const FILTER_KEYS = ['answered', 'comments', 'resolved', 'comply', 'partial', 'noncomply', 'na'] as const;
  type FilterKey = (typeof FILTER_KEYS)[number];
  const filter = (FILTER_KEYS as readonly string[]).includes(searchParams.filter ?? '')
    ? (searchParams.filter as FilterKey)
    : null;
  const matchFilter = (itemId: string) => {
    const r = responsesByItem.get(itemId);
    if (filter === 'answered') return Boolean(r?.compliance);
    if (filter === 'comments') {
      if (isObserverView) return r ? (practiceByResponse.get(r.id)?.length ?? 0) > 0 : false;
      return (r?.comments ?? []).length > 0;
    }
    if (filter === 'resolved') {
      const cs = r?.comments ?? [];
      return cs.length > 0 && cs[cs.length - 1].resolvedAt != null;
    }
    if (filter && filter in COMPLIANCE_FILTER) {
      return r?.compliance === COMPLIANCE_FILTER[filter as keyof typeof COMPLIANCE_FILTER];
    }
    return true;
  };
  // 各符合度數量(供篩選 chip 顯示;僅列有題者)
  const complianceCount = (level: ComplianceLevel) =>
    cycle.checklistVersion.items.filter((i) => responsesByItem.get(i.id)?.compliance === level).length;
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
        { label: pageTitle },
      ]}
    >
      {/* 回工作台導引列:與 prep/checklist/deficiencies 一致(原 review/audit 缺=動線斷崖,審計#6) */}
      <CycleHubBar
        cycleId={cycle.id}
        label={`${cycle.year - 1911} 年度 · ${cycle.organization.shortName ?? cycle.organization.name}`}
        nextHint="逐題審閱後,回工作台查看下一步"
      />
      <header className="mb-5">
        <h1 className="text-headline text-ink-900">{pageTitle}</h1>
        <p className="text-body-sm text-ink-500 mt-1 leading-relaxed">
          {isObserverView
            ? '逐題檢視機關說明與佐證,可於每題下方留下觀察員意見(練習用;僅您本人、您的指導者與中心可見),供您撰寫練習時對照。'
            : '逐題檢視機關說明與佐證,可於每題下方留下審閱筆記(依需要,不必每題),供您實地稽核時參考。'}
        </p>
        <p className="text-body-sm text-ink-500 mt-1">
          {cycle.organization.name} · {CYCLE_STATUS_LABELS[cycle.status as CycleStatus]}
          {/* 已作答 N/總 · 意見待補 N 由下方篩選 chip 承擔,header 不重述 */}
        </p>
      </header>

      {/* 委員審閱為留存筆記,不涉退回重填 → 此頁不提供退回(canReopen=false);僅顯示送出狀態。
          委員向:隱藏「如需修改請洽中心退回」等機關向文案(委員只是檢視)。 */}
      <SubmissionBanner
        cycleId={cycle.id}
        submittedAtISO={cycle.checklistSubmittedAt?.toISOString() ?? null}
        submittedBy={cycle.checklistSubmittedBy}
        reopenNote={null}
        canReopen={false}
        hideModifyHint={session.user.role === 'AUDITOR' || isObserverView}
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
          {withComments > 0 && (
            <FilterChipLink href={`/cycles/${cycle.id}/review?filter=comments`} selected={filter === 'comments'}>
              {isObserverView ? '觀察員意見' : '委員意見'} <FilterChipCount selected={filter === 'comments'}>{withComments}</FilterChipCount>
            </FilterChipLink>
          )}
          {resolvedPending > 0 && (
            <FilterChipLink href={`/cycles/${cycle.id}/review?filter=resolved`} selected={filter === 'resolved'}>
              已補正待複核 <FilterChipCount selected={filter === 'resolved'}>{resolvedPending}</FilterChipCount>
            </FilterChipLink>
          )}
          {/* 依機關作答符合度快速篩選:委員可一鍵挑出某一類逐一檢視,不必逐題往下翻 */}
          <span className="mx-1 h-4 w-px bg-rule" aria-hidden />
          {(['comply', 'partial', 'noncomply', 'na'] as const).map((key) => {
            const level = COMPLIANCE_FILTER[key];
            const n = complianceCount(level);
            if (n === 0) return null;
            return (
              <FilterChipLink key={key} href={`/cycles/${cycle.id}/review?filter=${key}`} selected={filter === key}>
                {COMPLIANCE_LABELS[level]} <FilterChipCount selected={filter === key}>{n}</FilterChipCount>
              </FilterChipLink>
            );
          })}
        </div>
      )}

      {/* 快速跳至構面(委員可直接跳到第一/四/七等構面,不必往下滑很久) */}
      {grouped.length > 1 && (
        <nav className="mb-5 flex items-center gap-1.5 flex-wrap" aria-label="構面快速導覽">
          <span className="text-caption text-ink-400 mr-0.5">跳至構面:</span>
          {grouped.map(({ dim, items }) => (
            <a
              key={dim}
              href={`#dim-${dim}`}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full border border-rule text-caption text-ink-700 hover:border-primary-400 hover:text-primary-700 hover:bg-primary-50/60 transition-colors focus-ring"
            >
              {DIMENSION_LABELS[dim as Dimension]}
              <span className="text-ink-400 tabular-nums">{items.length}</span>
            </a>
          ))}
        </nav>
      )}

      {answered === 0 ? (
        <Card>
          <EmptyState
            icon={<ClipboardCheck size={28} />}
            title="機關尚未開始填答"
            description={isObserverView ? "等機關至少完成一題後,即可在此檢視其自評與佐證,作為撰寫練習的素材。" : "等機關至少完成一題後,才能在此留下委員意見。"}
          />
        </Card>
      ) : (
        grouped.map(({ dim, items }) => (
          <details key={dim} id={`dim-${dim}`} open className="group mb-6 scroll-mt-4">
            <summary className="flex items-center gap-2 mb-3 cursor-pointer select-none list-none [&::-webkit-details-marker]:hidden">
              <ChevronRight size={18} className="text-ink-400 shrink-0 transition-transform group-open:rotate-90" aria-hidden />
              <h2 className="text-title-md text-ink-900">{DIMENSION_LABELS[dim as Dimension]}</h2>
              <Chip tone="neutral" size="sm">{items.length}</Chip>
            </summary>
            <div className="flex flex-col gap-3">
              {items.map((item) => {
                const r = responsesByItem.get(item.id);
                const c = r?.compliance as ComplianceLevel | null;
                return (
                  <Card key={item.id} variant="outlined">
                    <div className="flex items-start gap-3">
                      <Chip tone="sage" size="sm" className="font-mono shrink-0 mt-0.5">{item.itemNo}</Chip>
                      <div className="flex-1 min-w-0">
                        <p className="text-body text-ink-900 leading-relaxed">{item.content}</p>
                        <div className="mt-2 flex items-center gap-1.5 flex-wrap">
                          {c ? (
                            <Chip tone={complianceTone[c]} size="sm" dot>
                              {COMPLIANCE_LABELS[c]}
                            </Chip>
                          ) : (
                            <Chip tone="neutral" size="sm">未作答</Chip>
                          )}
                          {(r?.comments ?? []).length > 0 && (
                            <Chip tone="primary" size="sm">
                              委員意見 {(r!.comments).length}
                            </Chip>
                          )}
                          {isObserverView && r && (practiceByResponse.get(r.id)?.length ?? 0) > 0 && (
                            <Chip tone="primary" size="sm">
                              觀察員意見 {practiceByResponse.get(r.id)!.length}
                            </Chip>
                          )}
                        </div>
                        {/* 層1 機關作答主體:機關說明 prominent 作為題卡錨點 */}
                        {r?.description && (
                          <NoteBox prominent label="機關說明(規範內容、執行方式、執行結果)" className="mt-3">
                            <p className="text-body text-ink-900 leading-relaxed whitespace-pre-wrap">{r.description}</p>
                          </NoteBox>
                        )}
                        {r?.recordDocs && (
                          <NoteBox label="紀錄文件" className="mt-2">
                            <p className="text-body-sm text-ink-500 leading-relaxed whitespace-pre-wrap">{r.recordDocs}</p>
                          </NoteBox>
                        )}
                        {/* 層2 往返對話:機關補正回應以 primary tone 承載 */}
                        {r?.orgRevisionNote && (
                          <NoteBox tone="primary" label="機關補正回應(針對委員意見)" className="mt-2">
                            <p className="text-body-sm text-primary-900 leading-relaxed whitespace-pre-wrap">{r.orgRevisionNote}</p>
                          </NoteBox>
                        )}
                        {r && (evidenceByResponse.get(r.id)?.length ?? 0) > 0 && (
                          <NoteBox label="佐證檔案" className="mt-2">
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
                          </NoteBox>
                        )}

                        {/* 法規對照:委員審查時即時對照稽核依據 */}
                        {(item.auditBasis || item.auditFocus || item.expectedEvidence) && (
                          <details className={`mt-3 rounded-md ${SURFACE_INFO} overflow-hidden`}>
                            <summary className="cursor-pointer select-none px-3 py-2 text-body-sm font-medium text-primary-800 hover:bg-primary-50 transition-colors">
                              法規對照(稽核依據・稽核重點・應備文件)
                            </summary>
                            <div className="px-3 pb-3 pt-1 bg-card">
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
                              <ReviewNote
                                key={cm.id}
                                responseId={r.id}
                                commentId={cm.id}
                                authorLabel={authorNameById[cm.auditorId] ?? '委員'}
                                timeLabel={fmtROCDateTime(cm.createdAt)}
                                resolved={cm.resolvedAt != null}
                                content={cm.content}
                                // 作者本人、且機關尚未回應(未補正、未填補正回應)才可就地修正/刪除自己的筆記
                                // (與 API loadOwnEditableComment 的 resolvedAt / orgRevisionNote 雙閘一致)
                                canManage={session.user.id === cm.auditorId && cm.resolvedAt == null && r.orgRevisionNote == null}
                              />
                            ))}
                          </div>
                        )}

                        {/* 觀察員意見(批42):比照委員意見,存獨立 PracticeComment 表(僅本人/指導者/中心可見) */}
                        {isObserverView ? (
                          r ? (
                            <ObserverCommentSection
                              responseId={r.id}
                              comments={(practiceByResponse.get(r.id) ?? []).map((c) => ({
                                id: c.id,
                                content: c.content,
                                timeLabel: fmtROCDateTime(c.createdAt),
                              }))}
                            />
                          ) : (
                            <p className="mt-2 text-caption text-ink-500">（填報人尚未作答，暫無法留言）</p>
                          )
                        ) : r ? (
                          <div className="mt-3">
                            <CommentForm responseId={r.id} />
                          </div>
                        ) : (
                          <p className="mt-2 text-caption text-ink-500">（填報人尚未作答，暫無法留言）</p>
                        )}
                      </div>
                    </div>
                  </Card>
                );
              })}
            </div>
          </details>
        ))
      )}

      {/* 委員審閱=留存筆記,中心不審閱委員意見→取消「意見填寫完成/通知中心」收尾動作(UAT)。 */}
    </AppShell>
  );
}
