import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { prisma } from '@/lib/db';
import { auth } from '@/lib/auth';
import { AppShell } from '@/components/shell/AppShell';
import { CycleHubBar } from '@/components/cycle/CycleHubBar';
import { Card } from '@/components/ui/Card';
import { Chip } from '@/components/ui/Chip';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { FilterChipLink, FilterChipCount } from '@/components/ui/FilterChip';
import { AlertTriangle, ChevronRight } from '@/components/icons';
import {
  DEFICIENCY_ASPECT_LABELS,
  DEFICIENCY_TYPE_LABELS,
  ACTION_STATUS_LABELS,
  type DeficiencyAspect,
  type DeficiencyType,
  type ActionStatus,
  type Role,
} from '@/lib/types';
import { canAccess } from '@/lib/access-policy';
import { actionStatusTone } from '@/lib/state-machine';
import { toneClasses } from '@/lib/stage';
import { EMPTY } from '@/lib/copy';
import { DeadlineChip } from '@/components/cycle/DeadlineChip';
import AdminDeficiencyTools from './AdminDeficiencyTools';

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
  const aspectNumber: Record<DeficiencyAspect, string> = {
    STRATEGY: '一', MANAGEMENT: '二', TECHNICAL: '三',
  };

  const total = cycle.deficiencies.length;
  const passed = cycle.deficiencies.filter((d) => d.action?.status === 'PASSED').length;
  const returned = cycle.deficiencies.filter((d) => d.action?.status === 'RETURNED').length;
  // 連續審查:委員只計/進入「指派給本人審閱」的送審缺失;中心(SUPER_ADMIN)可審全部送審。
  // reviewer-aware,對齊詳情頁 canReview 與 review API 授權,避免膨脹待審數或導向不可審之缺失。
  const reviewable = cycle.deficiencies.filter(
    (d) =>
      (d.action?.status ?? 'PENDING') === 'SUBMITTED' &&
      (user.role !== 'AUDITOR' || d.reviewerAuditorId === user.id),
  );
  const firstReviewable = reviewable[0];
  const canReview = user.role === 'AUDITOR' || user.role === 'SUPER_ADMIN';

  // 套用狀態篩選
  const statusOf = (d: (typeof cycle.deficiencies)[number]) => (d.action?.status ?? 'PENDING') as ActionStatus;
  const activeFilter = FILTERS.find((f) => f.key === (searchParams.status ?? 'all')) ?? FILTERS[0];
  const filtered = cycle.deficiencies.filter((d) => activeFilter.match(statusOf(d)));
  const countOf = (f: (typeof FILTERS)[number]) => cycle.deficiencies.filter((d) => f.match(statusOf(d))).length;

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
          <h1 className="text-headline text-on-surface">缺失與矯正管考</h1>
          <p className="mt-1 text-body-sm text-on-surface-variant">
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
        <div className="flex flex-col gap-8">
          {aspects.map((aspect) => {
            const inAspect = filtered.filter((d) => d.aspect === aspect);
            if (inAspect.length === 0) return null;
            const types: DeficiencyType[] = ['IMPROVE', 'SUGGEST'];
            return (
              <section key={aspect}>
                <h2 className="text-title-lg text-on-surface mb-4">
                  {aspectNumber[aspect]}、實地稽核－{DEFICIENCY_ASPECT_LABELS[aspect]}
                </h2>
                <div className="flex flex-col gap-6">
                  {types.map((type) => {
                    const items = inAspect.filter((d) => d.type === type);
                    if (items.length === 0) return null;
                    return (
                      <div key={type}>
                        <p className="text-label text-on-surface-variant mb-3">
                          {DEFICIENCY_TYPE_LABELS[type]}（{items.length} 項）
                        </p>
                        <div className="flex flex-col gap-2.5">
                          {items.map((d) => {
                            const status = (d.action?.status ?? 'PENDING') as ActionStatus;
                            const round = d.action?.round ?? 1;
                            return (
                              <Link key={d.id} href={`/cycles/${cycle.id}/deficiencies/${d.id}`} className="group block focus-ring rounded-md">
                                <Card interactive padded={false} className="overflow-hidden">
                                  <div className="flex">
                                    {/* 左緣狀態色條(顏色非唯一訊號,右側仍有 Chip+dot+文字) */}
                                    <div
                                      className={`w-1.5 self-stretch shrink-0 ${toneClasses(actionStatusTone(status)).dot}`}
                                      aria-hidden
                                    />
                                    <div className="flex-1 flex items-center gap-4 p-4 sm:p-5">
                                    <span className="w-9 h-9 rounded-md bg-surface-container flex items-center justify-center text-title text-on-surface-variant tabular-nums shrink-0">
                                      {d.itemNo}
                                    </span>
                                    <div className="flex-1 min-w-0">
                                      <p className="text-body-sm text-on-surface-variant leading-relaxed line-clamp-2">
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
                                    <ChevronRight size={16} className="text-on-surface-variant shrink-0 transition-transform group-hover:translate-x-0.5" />
                                    </div>
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
