import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { prisma } from '@/lib/db';
import { auth } from '@/lib/auth';
import { AppShell } from '@/components/shell/AppShell';
import { CycleHubBar } from '@/components/cycle/CycleHubBar';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { FilterChipLink, FilterChipCount } from '@/components/ui/FilterChip';
import { AlertTriangle } from '@/components/icons';
import {
  DEFICIENCY_ASPECT_LABELS,
  DEFICIENCY_ASPECT_NUM,
  DEFICIENCY_TYPE_LABELS,
  type DeficiencyAspect,
  type DeficiencyType,
  type ActionStatus,
  type Role,
} from '@/lib/types';
import { canAccess } from '@/lib/access-policy';
import { EMPTY } from '@/lib/copy';
import { DeadlineChip } from '@/components/cycle/DeadlineChip';
import AdminDeficiencyTools from './AdminDeficiencyTools';
import SubmitRoundButton from './SubmitRoundButton';
import { DeficiencyAccordionProvider, DeficiencyRow, DeficiencyAspectSection } from './DeficiencyAccordion';

// 狀態篩選:todo = 待填報(未開始+草稿)、returned/submitted/passed 對應單一狀態
// 列卡左緣狀態色條沿用 stage.ts toneClasses().dot(單一真實來源,與矩陣/任務卡同語彙)
const FILTERS = [
  { key: 'all', label: '全部', match: () => true },
  { key: 'todo', label: '待填報', match: (s: ActionStatus) => s === 'PENDING' || s === 'DRAFT' },
  { key: 'returned', label: '退回補正', match: (s: ActionStatus) => s === 'RETURNED' },
  { key: 'submitted', label: '審查中', match: (s: ActionStatus) => s === 'SUBMITTED' },
  { key: 'passed', label: '已通過', match: (s: ActionStatus) => s === 'PASSED' },
] as const;

export default async function DeficienciesPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams: { status?: string };
}) {
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
  if (user.role === 'ORG_ADMIN' && cycle.organizationId !== user.organizationId) redirect('/dashboard');
  if (user.role === 'AUDITOR' && !cycle.assignments.some((a) => a.auditorId === user.id)) redirect('/dashboard');
  // 缺失與矯正管考開放時機:委員待缺失發布(REPORT_ISSUED)、機關待矯正執行(REMEDIATION);中心全程。在此之前導回。
  if (user.role !== 'SUPER_ADMIN' && !canAccess('deficiencies.view', user.role as Role, cycle.status)) redirect('/dashboard');

  const yearROC = cycle.year - 1911;
  const aspects: DeficiencyAspect[] = ['STRATEGY', 'MANAGEMENT', 'TECHNICAL'];

  // 委員只見「指派給本人審閱」的缺失(UAT 批66:不看其他委員/全體的缺失);中心/機關看全部(機關本就同院)。
  // reviewer-aware 一致於詳情頁 canReview、review API 授權與連續審查——清單/計數/篩選全以此為基準,不再膨脹。
  const myDeficiencies =
    user.role === 'AUDITOR'
      ? cycle.deficiencies.filter((d) => d.reviewerAuditorId === user.id)
      : cycle.deficiencies;

  const total = myDeficiencies.length;
  const passed = myDeficiencies.filter((d) => d.action?.status === 'PASSED').length;
  const returned = myDeficiencies.filter((d) => d.action?.status === 'RETURNED').length;
  // 連續審查:送審中且屬本人可見範圍(myDeficiencies 已 reviewer-aware);中心可審全部送審。
  const reviewable = myDeficiencies.filter((d) => (d.action?.status ?? 'PENDING') === 'SUBMITTED');
  const firstReviewable = reviewable[0];
  const canReview = user.role === 'AUDITOR' || user.role === 'SUPER_ADMIN';
  // 機關「一輪統一送審」候選數(批50):草稿/退回補正中(可送);僅機關於矯正執行中顯示送出鈕。
  const submittableCount =
    user.role === 'ORG_ADMIN'
      ? myDeficiencies.filter((d) => {
          const s = (d.action?.status ?? 'PENDING') as ActionStatus;
          return s === 'DRAFT' || s === 'RETURNED';
        }).length
      : 0;

  // 套用狀態篩選(基準=本人可見缺失)
  const statusOf = (d: (typeof cycle.deficiencies)[number]) => (d.action?.status ?? 'PENDING') as ActionStatus;
  const activeFilter = FILTERS.find((f) => f.key === (searchParams.status ?? 'all')) ?? FILTERS[0];
  const filtered = myDeficiencies.filter((d) => activeFilter.match(statusOf(d)));
  const countOf = (f: (typeof FILTERS)[number]) => myDeficiencies.filter((d) => f.match(statusOf(d))).length;

  return (
    <AppShell
      user={{ name: user.name, email: user.email, role: user.role, organizationName: user.organizationName }}
      cycleId={cycle.id}
      watermark
      crumbs={[
        { label: '總覽', href: '/dashboard' },
        { label: '稽核週期', href: '/cycles' },
        { label: `${yearROC} 年度 · ${cycle.organization.name}`, href: `/cycles/${cycle.id}` },
        { label: '缺失與矯正' },
      ]}
    >
      <CycleHubBar
        cycleId={cycle.id}
        label={`${yearROC} 年度 · ${cycle.organization.shortName ?? cycle.organization.name}`}
        nextHint="填報送審後,於工作台追蹤審查進度"
      />
      <header className="mb-6 flex items-start justify-between gap-4 flex-wrap">
        <div className="min-w-0">
          <h1 className="text-headline text-ink-900">缺失與矯正管考</h1>
          <p className="mt-1 text-body-sm text-ink-500">
            {yearROC} 年度 · {cycle.organization.name} · 共 {total} 項
            {/* 通過/待審/退回 分項數字由下方可點擊的篩選 chip 承擔,header 不重述 */}
          </p>
          <div className="mt-2">
            <DeadlineChip status={cycle.status} dueDate={cycle.dueDate} allPassed={total > 0 && passed === total} />
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap shrink-0">
          {canReview && reviewable.length > 0 && firstReviewable && (
            <Link href={`/cycles/${cycle.id}/deficiencies/${firstReviewable.id}`}>
              <Button variant="filled" size="sm">開始連續審查({reviewable.length})</Button>
            </Link>
          )}
          {user.role === 'ORG_ADMIN' && cycle.status === 'REMEDIATION' && (
            <SubmitRoundButton cycleId={cycle.id} count={submittableCount} />
          )}
          {user.role === 'SUPER_ADMIN' && cycle.status !== 'CLOSED' && (
            <AdminDeficiencyTools cycleId={cycle.id} cycleStatus={cycle.status} />
          )}
        </div>
      </header>

      {/* 狀態篩選 tabs */}
      {total > 0 && (
        <div className="mb-6 flex items-center gap-2 flex-wrap" role="group" aria-label="篩選缺失狀態">
          {FILTERS.map((f) => {
            const n = countOf(f);
            const active = f.key === activeFilter.key;
            if (f.key !== 'all' && n === 0 && !active) return null;
            return (
              <FilterChipLink
                key={f.key}
                href={f.key === 'all' ? `/cycles/${cycle.id}/deficiencies` : `/cycles/${cycle.id}/deficiencies?status=${f.key}`}
                selected={active}
              >
                {f.label}
                <FilterChipCount selected={active}>{n}</FilterChipCount>
              </FilterChipLink>
            );
          })}
        </div>
      )}

      {total === 0 ? (
        <Card variant="outlined" padded={false}>
          <div className="p-6">
            <EmptyState
              icon={<AlertTriangle size={28} />}
              title={EMPTY.noDeficiencies.title}
              description={
                user.role === 'SUPER_ADMIN'
                  ? '使用右上角「新增缺失」逐筆建立，或「Excel 匯入」一次帶入教育部範本。'
                  : user.role === 'AUDITOR'
                    ? '目前沒有指派給您審閱的缺失;其他委員負責審閱的缺失不會顯示於此。'
                    : EMPTY.noDeficiencies.description
              }
            />
          </div>
        </Card>
      ) : filtered.length === 0 ? (
        <Card variant="outlined" padded={false}>
          <div className="p-6">
            <EmptyState
              icon={<AlertTriangle size={28} />}
              title={`沒有「${activeFilter.label}」的項目`}
              description="切換上方篩選即可查看其他狀態的缺失。"
            />
          </div>
        </Card>
      ) : (
        <DeficiencyAccordionProvider>
          <div className="flex flex-col gap-4">
          {aspects.map((aspect) => {
            const inAspect = filtered.filter((d) => d.aspect === aspect);
            // 機關管理員:三構面永遠顯示(即使無缺失)且預設收合,填報時再展開(批48 圖7);
            // 委員/中心:僅顯示有缺失的構面且預設展開(維持批47 逐筆快速檢視)。
            const isOrgAdmin = user.role === 'ORG_ADMIN';
            if (inAspect.length === 0 && !isOrgAdmin) return null;
            const types: DeficiencyType[] = ['IMPROVE', 'SUGGEST'];
            const improveN = inAspect.filter((d) => d.type === 'IMPROVE').length;
            const suggestN = inAspect.filter((d) => d.type === 'SUGGEST').length;
            return (
              <DeficiencyAspectSection
                key={aspect}
                title={`${DEFICIENCY_ASPECT_NUM[aspect]}、實地稽核－${DEFICIENCY_ASPECT_LABELS[aspect]}`}
                improveN={improveN}
                suggestN={suggestN}
                defaultCollapsed={isOrgAdmin}
              >
                <div className="flex flex-col gap-6">
                  {types.map((type) => {
                    const items = inAspect.filter((d) => d.type === type);
                    if (items.length === 0) return null;
                    return (
                      <div key={type}>
                        <p className="text-label text-ink-500 mb-3">
                          {DEFICIENCY_TYPE_LABELS[type]}（{items.length} 項）
                        </p>
                        <div className="flex flex-col gap-2.5">
                          {items.map((d) => (
                            <DeficiencyRow
                              key={d.id}
                              cycleId={cycle.id}
                              id={d.id}
                              itemNo={d.itemNo}
                              description={d.description}
                              checklistRef={d.checklistRef}
                              status={(d.action?.status ?? 'PENDING') as ActionStatus}
                              round={d.action?.round ?? 1}
                            />
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </DeficiencyAspectSection>
            );
          })}
          </div>
        </DeficiencyAccordionProvider>
      )}
    </AppShell>
  );
}
