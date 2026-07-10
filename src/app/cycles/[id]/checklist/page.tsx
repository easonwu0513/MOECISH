import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { prisma } from '@/lib/db';
import { auth } from '@/lib/auth';
import { AppShell } from '@/components/shell/AppShell';
import { CycleHubBar } from '@/components/cycle/CycleHubBar';
import { auditorCanViewChecklistContent, auditorReviewWindowState, checklistOrgCanEdit, type Dimension } from '@/lib/types';
import { ReviewWindowLockedPage } from '@/components/cycle/ReviewWindowLockedPage';
import { filterOwnComments } from '@/lib/auditor-visibility';
import ChecklistShell from './ChecklistShell';

export default async function ChecklistPage({ params }: { params: { id: string } }) {
  const session = await auth();
  if (!session) redirect(`/login?callbackUrl=/cycles/${params.id}/checklist`);
  const user = session.user;
  // 未列舉角色預設拒絕(批30 雷區:新角色落過各 role redirect 即 fail-open 繼承視野)
  if (!['SUPER_ADMIN', 'ORG_ADMIN', 'AUDITOR', 'OBSERVER'].includes(user.role)) redirect('/dashboard');

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

  if (
    user.role === 'ORG_ADMIN' &&
    cycle.organizationId !== user.organizationId
  ) {
    redirect('/dashboard');
  }
  // 觀察員(批30):檢核表「填報」頁為機關/中心動線;觀察員唯讀動線一律走審閱頁
  if (user.role === 'OBSERVER') redirect(`/cycles/${params.id}/review`);
  // 委員僅能進入被指派的週期(與審閱頁/API 同一道隔離)
  if (
    user.role === 'AUDITOR' &&
    !cycle.assignments.some((a) => a.auditorId === user.id)
  ) {
    redirect('/dashboard');
  }
  // 委員一律於週期進入「資料齊備」後才可檢視機關檢核表內容(開立中/資料準備中不開放)
  if (user.role === 'AUDITOR' && !auditorCanViewChecklistContent(cycle.status)) {
    redirect('/dashboard');
  }
  // 審閱時間區間閘(UAT 批67):委員不在窗口內(或未設)→ 早退顯鎖定頁,不渲染機關檢核表內容
  const reviewState = user.role === 'AUDITOR'
    ? auditorReviewWindowState(cycle.reviewWindowStart, cycle.reviewWindowEnd)
    : 'open';
  if (reviewState !== 'open') {
    // 早退鎖定頁(共用殼,與 /review 一致;不載入機關資料)
    return <ReviewWindowLockedPage user={user} cycle={cycle} title="資通安全檢核表" crumbLabel="檢核表" state={reviewState} />;
  }

  const submitted = Boolean(cycle.checklistSubmittedAt);
  // 機關填報/送出僅限「資料準備中」;開立中(DRAFT)中心尚在設定,機關不可填(唯讀)
  const canEdit = user.role === 'ORG_ADMIN' && checklistOrgCanEdit(cycle.status) && !submitted;
  const canSubmit = user.role === 'ORG_ADMIN' && checklistOrgCanEdit(cycle.status);
  // 開立中:機關尚不可填,顯示「尚未開放」提示(唯讀)
  const orgPhaseNotOpen = user.role === 'ORG_ADMIN' && cycle.status === 'DRAFT';
  // 退回重填改由中心(最高管理員)單一決定;委員逐題留意見並按「意見填寫完成」
  // 退回重填僅在「資料準備中」提供(全掃 P1):機關唯一能重編的階段,避免退了卻鎖死機關的死路
  const canReopen = user.role === 'SUPER_ADMIN' && checklistOrgCanEdit(cycle.status);

  const items = cycle.checklistVersion.items.map((i) => ({
    id: i.id,
    itemNo: i.itemNo,
    content: i.content,
    dimension: i.dimension as Dimension,
    orderIndex: i.orderIndex,
    auditBasis: i.auditBasis,
    auditFocus: i.auditFocus,
    expectedEvidence: i.expectedEvidence,
  }));

  // 每題佐證檔數(供卡頭徽章 A2):依 responseId 統計 → 對映 itemId
  const responseIds = cycle.responses.map((r) => r.id);
  const evCounts = responseIds.length
    ? await prisma.evidence.groupBy({
        by: ['targetId'],
        where: { targetType: 'CHECKLIST_RESPONSE', targetId: { in: responseIds } },
        _count: true,
      })
    : [];
  const countByResponse = Object.fromEntries(evCounts.map((e) => [e.targetId, e._count])) as Record<string, number>;
  const evidenceCountByItem: Record<string, number> = {};
  for (const r of cycle.responses) {
    const n = countByResponse[r.id] ?? 0;
    if (n > 0) evidenceCountByItem[r.checklistItemId] = n;
  }

  // 委員的檢核表審閱意見定位為「委員資料齊備後先行審閱的私人註記/筆記」,不開放受稽機關檢視;
  // 對機關的正式回饋以實地稽核當天開立之「稽核發現/缺失」為準。故機關端一律不下發委員意見。
  const hideAuditorComments = user.role === 'ORG_ADMIN';
  // 委員意見隱私(UAT 批62):委員僅見自己填寫的意見(與 /review 頁同規則,共用 lib);中心見全部
  filterOwnComments(cycle.responses, user.role, user.id);
  // 委員意見作者:僅委員/中心可見具名;受稽機關端不顯示作者(避免針對個別委員)
  const showAuthors = user.role === 'AUDITOR' || user.role === 'SUPER_ADMIN';
  const commentAuthorIds = showAuthors
    ? Array.from(new Set(cycle.responses.flatMap((r) => r.comments.map((c) => c.auditorId))))
    : [];
  const authorNameById: Record<string, string> = {};
  if (commentAuthorIds.length) {
    const authors = await prisma.user.findMany({ where: { id: { in: commentAuthorIds } }, select: { id: true, name: true } });
    for (const a of authors) authorNameById[a.id] = a.name;
  }

  const responses = cycle.responses.map((r) => ({
    id: r.id,
    checklistItemId: r.checklistItemId,
    compliance: r.compliance as ('COMPLIANT' | 'PARTIALLY_COMPLIANT' | 'NON_COMPLIANT' | 'NOT_APPLICABLE' | null),
    description: r.description,
    recordDocs: r.recordDocs,
    orgRevisionNote: r.orgRevisionNote,
    version: r.version,
    // 機關端不下發委員審閱意見(私人註記);委員/中心可見
    comments: hideAuditorComments
      ? []
      : r.comments.map((c) => ({
          id: c.id,
          content: c.content,
          round: c.round,
          resolvedAt: c.resolvedAt,
          createdAt: c.createdAt,
          authorName: showAuthors ? (authorNameById[c.auditorId] ?? '委員') : null,
        })),
  }));

  return (
    <AppShell
      user={{
        name: user.name,
        email: user.email,
        role: user.role,
        organizationName: user.organizationName,
      }}
      cycleId={cycle.id}
      watermark
      crumbs={[
        { label: '總覽', href: '/dashboard' },
        { label: `${cycle.year - 1911} 年度`, href: `/cycles/${cycle.id}` },
        { label: '檢核表填報' },
      ]}
    >
      <CycleHubBar
        cycleId={cycle.id}
        label={`${cycle.year - 1911} 年度 · ${cycle.organization.shortName ?? cycle.organization.name}`}
        nextHint="填報送出後，於工作台確認進度與下一步"
      />
      <header className="mb-5">
        <h1 className="text-headline text-ink-900">資通安全檢核表填報</h1>
        <p className="text-body-sm text-ink-500 mt-1">
          {cycle.organization.name} · {cycle.checklistVersion.name} · 共 {cycle.checklistVersion.items.length} 題 ·{' '}
          {canEdit
            ? '填寫中（每題可展開「法規對照」查看稽核依據與應備文件）'
            : submitted
              ? '已送出鎖定'
              : '目前狀態為唯讀'}
        </p>
      </header>

      {orgPhaseNotOpen && (
        <div className="mb-5 rounded-md bg-paper-sunk px-4 py-3 text-body-sm text-ink-500 leading-relaxed">
          此階段（開立中）尚未開放檢核表填報。待中心將週期推進至「資料準備中」後，即可逐題填寫符合度、說明並上傳佐證。目前僅供檢視。
        </div>
      )}

      <ChecklistShell
        cycleId={cycle.id}
        items={items}
        responses={responses}
        canEdit={canEdit}
        userRole={user.role}
        canSubmit={canSubmit}
        canReopen={canReopen}
        submittedAtISO={cycle.checklistSubmittedAt?.toISOString() ?? null}
        submittedBy={cycle.checklistSubmittedBy}
        reopenNote={cycle.checklistReopenNote}
        evidenceCountByItem={evidenceCountByItem}
      />
    </AppShell>
  );
}
