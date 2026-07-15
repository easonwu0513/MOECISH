import { redirect } from 'next/navigation';
import { prisma } from '@/lib/db';
import { auth } from '@/lib/auth';
import { AppShell } from '@/components/shell/AppShell';
import { FilterChipLink, FilterChipCount } from '@/components/ui/FilterChip';
import { canAccess } from '@/lib/access-policy';
import { isTrackedOverdue, isTrackedDueSoon } from '@/lib/tracking';
import type { Role } from '@/lib/types';
import TrackedItem, { type TrackedDTO } from './TrackedItem';

export const dynamic = 'force-dynamic';

type ReviewSelect = {
  id: string; content: string; execStatus: string;
  submittedAt: Date; submittedById: string;
  reviewStatus: string; reviewNote: string | null; reviewedAt: Date | null; reviewedById: string | null;
};

export default async function TrackingPage({
  searchParams,
}: {
  searchParams: { status?: string; overdue?: string; org?: string };
}) {
  const session = await auth();
  if (!session) redirect('/login?callbackUrl=/tracking');
  const user = session.user;
  // 顯式列舉 + 未列舉即拒絕(fail-closed 雷區):觀察員與未知角色一律導離
  if (!canAccess('tracking.view', user.role as Role, 'REMEDIATION')) redirect('/dashboard');

  // 狀態篩選:預設持續列管中;可看已完成 / 全部
  const statusParam = searchParams.status === 'completed' ? 'COMPLETED' : searchParams.status === 'all' ? null : 'TRACKING';
  const overdueOnly = searchParams.overdue === '1';
  const orgFilter = searchParams.org || null;

  const includeTracked = {
    reports: {
      orderBy: { submittedAt: 'desc' as const },
      select: {
        id: true, content: true, execStatus: true,
        submittedAt: true, submittedById: true,
        reviewStatus: true, reviewNote: true, reviewedAt: true, reviewedById: true,
      },
    },
    assignedAuditor: { select: { id: true, name: true } },
    organization: { select: { name: true, shortName: true } },
  };

  const baseWhere =
    user.role === 'ORG_ADMIN'
      ? { organizationId: user.organizationId ?? '__none__' }
      : user.role === 'AUDITOR'
      ? {
          // 委員=協審項(可審核)∪ 現任指派「進行中週期」機關之列管項(批72 調閱,唯讀——
          // 審核權於卡片(assignedAuditorId===本人)與 review API 雙層另擋,不隨可見性放大)
          OR: [
            { assignedAuditorId: user.id },
            { organization: { cycles: { some: { status: { notIn: ['DRAFT', 'CLOSED'] }, assignments: { some: { auditorId: user.id } } } } } },
          ],
        }
      : {}; // SUPER_ADMIN:全機關

  const where = {
    ...baseWhere,
    ...(statusParam ? { status: statusParam } : {}),
    ...(orgFilter && user.role === 'SUPER_ADMIN' ? { organizationId: orgFilter } : {}),
  };

  const rows = await prisma.trackedDeficiency.findMany({
    where,
    include: includeTracked,
    orderBy: [{ nextReportDue: 'asc' }, { createdAt: 'asc' }],
  });

  // 佐證(單次查所有回報)+ 送出者/審核者姓名(快照 id → 名)
  const reportIds = rows.flatMap((t) => t.reports.map((r) => r.id));
  const evidences = reportIds.length
    ? await prisma.evidence.findMany({
        where: { targetType: 'TRACKED_REPORT', targetId: { in: reportIds } },
        select: { id: true, originalName: true, mimeType: true, sizeBytes: true, targetId: true },
        orderBy: { uploadedAt: 'asc' },
      })
    : [];
  const evByReport = new Map<string, { id: string; originalName: string; mimeType: string; sizeBytes: number }[]>();
  for (const e of evidences) {
    const list = evByReport.get(e.targetId) ?? [];
    list.push({ id: e.id, originalName: e.originalName, mimeType: e.mimeType, sizeBytes: e.sizeBytes });
    evByReport.set(e.targetId, list);
  }

  const userIds = Array.from(
    new Set(rows.flatMap((t) => t.reports.flatMap((r) => [r.submittedById, r.reviewedById].filter(Boolean) as string[]))),
  );
  const names = userIds.length
    ? await prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, name: true } })
    : [];
  const nameMap = new Map(names.map((u) => [u.id, u.name]));

  // 委員名單(中心指派協審用)
  const auditors =
    user.role === 'SUPER_ADMIN'
      ? await prisma.user.findMany({
          where: { role: 'AUDITOR', isActive: true },
          select: { id: true, name: true, organizationId: true },
          orderBy: { name: 'asc' },
        })
      : [];

  // 機關端遮蔽審核者姓名(比照缺失詳情頁對機關遮蔽委員姓名);中心/委員見真名
  const showReviewerName = user.role !== 'ORG_ADMIN';

  const toDTO = (t: (typeof rows)[number]): TrackedDTO => ({
    id: t.id,
    aspect: t.aspect,
    type: t.type,
    itemNo: t.itemNo,
    description: t.description,
    checklistRef: t.checklistRef,
    originYear: t.originYear,
    status: t.status,
    cadenceMonths: t.cadenceMonths,
    nextReportDue: t.nextReportDue.toISOString(),
    overdue: t.status === 'TRACKING' && isTrackedOverdue(t.nextReportDue),
    assignedAuditorId: t.assignedAuditorId,
    assignedAuditorName: t.assignedAuditor?.name ?? null,
    orgName: t.organization.shortName ?? t.organization.name,
    reports: t.reports.map((r: ReviewSelect) => ({
      id: r.id,
      content: r.content,
      execStatus: r.execStatus,
      submittedAt: r.submittedAt.toISOString(),
      submitterName: nameMap.get(r.submittedById) ?? null,
      reviewStatus: r.reviewStatus,
      reviewNote: r.reviewNote,
      reviewedAt: r.reviewedAt?.toISOString() ?? null,
      reviewerName: showReviewerName && r.reviewedById ? nameMap.get(r.reviewedById) ?? null : null,
      evidences: evByReport.get(r.id) ?? [],
    })),
  });

  let items = rows.map(toDTO);
  if (overdueOnly) items = items.filter((t) => t.overdue);

  // 機關端:「待回報」(逾期或 30 天內將到期)置頂
  if (user.role === 'ORG_ADMIN') {
    const dueSoon = (t: TrackedDTO) => t.status === 'TRACKING' && isTrackedDueSoon(t.nextReportDue);
    items = [...items].sort((a, b) => Number(dueSoon(b)) - Number(dueSoon(a)));
  }

  const crumbs = [{ label: '總覽', href: '/dashboard' }, { label: '缺失持續列管' }];

  // 篩選連結建構(保留其他參數)
  const buildHref = (patch: Record<string, string | null>) => {
    const p = new URLSearchParams();
    const cur = { status: searchParams.status ?? '', overdue: searchParams.overdue ?? '', org: searchParams.org ?? '', ...patch };
    for (const [k, v] of Object.entries(cur)) if (v) p.set(k, v as string);
    const q = p.toString();
    return q ? `/tracking?${q}` : '/tracking';
  };
  const curStatus = searchParams.status === 'completed' ? 'completed' : searchParams.status === 'all' ? 'all' : 'tracking';

  // 中心:按機關分組
  const groups = new Map<string, TrackedDTO[]>();
  if (user.role === 'SUPER_ADMIN') {
    for (const t of items) {
      const list = groups.get(t.orgName) ?? [];
      list.push(t);
      groups.set(t.orgName, list);
    }
  }

  const trackingCount = items.filter((t) => t.status === 'TRACKING').length;
  const overdueCount = rows.map(toDTO).filter((t) => t.overdue).length;

  const lede =
    user.role === 'ORG_ADMIN'
      ? '歷次稽核中「填報辦理中而審核通過」的缺失，將於此持續追蹤至改善完成。請於回報期限前提交最新進度與佐證；「待回報」項目已為您置頂。'
      : user.role === 'AUDITOR'
      ? '以下為指派給您協審的持續列管缺失，以及您現任稽核週期機關的列管項（供實地稽核前調閱）。協審項可於檢視機關回報後審核：通過續列管、認可完成或退回補正。'
      : '跨機關「歷年未完成缺失」持續列管總覽。逐項可調整回報週期、指派協審委員、審核機關回報。逾期未回報者以紅標示。';

  return (
    <AppShell
      user={{ name: user.name, email: user.email, role: user.role, organizationName: user.organizationName }}
      crumbs={crumbs}
      watermark
    >
      <header className="mb-8 pb-5 border-b border-rule">
        <h1 className="text-headline-lg text-ink-900 tracking-tight">缺失持續列管</h1>
        <p className="mt-2.5 text-body-sm text-ink-500 max-w-2xl leading-relaxed">{lede}</p>
      </header>

      {/* 篩選:狀態 + 逾期(中心/委員可切「已完成/全部」;機關同用) */}
      <div className="mb-6 flex items-center gap-2 flex-wrap" role="group" aria-label="篩選">
        <FilterChipLink href={buildHref({ status: null })} selected={curStatus === 'tracking'}>持續列管中</FilterChipLink>
        <FilterChipLink href={buildHref({ status: 'completed', overdue: null })} selected={curStatus === 'completed'}>已完成</FilterChipLink>
        <FilterChipLink href={buildHref({ status: 'all', overdue: null })} selected={curStatus === 'all'}>全部</FilterChipLink>
        {curStatus !== 'completed' && (
          <>
            <span className="mx-1 h-4 w-px bg-rule" aria-hidden />
            <FilterChipLink href={buildHref({ overdue: overdueOnly ? null : '1' })} selected={overdueOnly}>
              只看逾期未回報 <FilterChipCount selected={overdueOnly}>{overdueCount}</FilterChipCount>
            </FilterChipLink>
          </>
        )}
      </div>

      {items.length === 0 ? (
        <div className="rounded-md border border-rule bg-card px-6 py-16 text-center">
          <p className="text-title text-ink-700">
            {overdueOnly ? '目前沒有逾期未回報的列管缺失' : curStatus === 'completed' ? '尚無已完成結案的列管缺失' : '目前沒有持續列管中的缺失'}
          </p>
          <p className="mt-1.5 text-body-sm text-ink-500">
            {user.role === 'SUPER_ADMIN'
              ? '當機關填報「辦理中」且缺失審核通過時，系統會自動將該缺失轉入此處滾動追蹤。'
              : '當缺失以「辦理中」通過審核時，會自動轉入此處持續追蹤。'}
          </p>
        </div>
      ) : user.role === 'SUPER_ADMIN' ? (
        <div className="space-y-8">
          {Array.from(groups.entries()).map(([orgName, list]) => (
            <section key={orgName}>
              <div className="mb-3 flex items-center gap-2">
                <h2 className="text-title-md text-ink-900">{orgName}</h2>
                <span className="text-caption text-ink-500 tabular-nums">{list.length} 項</span>
              </div>
              <div className="space-y-4">
                {list.map((t) => (
                  <TrackedItem key={t.id} item={t} role={user.role} userId={user.id} auditors={auditors} />
                ))}
              </div>
            </section>
          ))}
        </div>
      ) : (
        <div className="space-y-4">
          {items.map((t) => (
            <TrackedItem key={t.id} item={t} role={user.role} userId={user.id} />
          ))}
        </div>
      )}

      {items.length > 0 && (
        <p className="mt-8 text-caption text-ink-500">
          共 {items.length} 項{curStatus === 'tracking' ? `，其中持續列管中 ${trackingCount} 項` : ''}。
        </p>
      )}
    </AppShell>
  );
}
