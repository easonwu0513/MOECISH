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
import { parseAssignDimensions, ASSIGN_ASPECT_LABELS } from '@/lib/audit-score';
import type { CycleStatus } from '@/lib/types';
import { EMPTY } from '@/lib/copy';
import { fmtROC } from '@/lib/date';
import { cn } from '@/lib/cn';
import { DeadlineChip } from '@/components/cycle/DeadlineChip';
import BatchCreateCycles from '@/app/admin/cycles/BatchCreateCycles';

// 委員/機關清單依登入者即時查詢(含新指派的週期),不可被靜態快取
export const dynamic = 'force-dynamic';

export default async function CyclesPage({ searchParams }: { searchParams: { year?: string } }) {
  const session = await auth();
  if (!session) redirect('/login?callbackUrl=/cycles');
  const user = session.user;

  const where =
    user.role === 'ORG_ADMIN'
      ? { organizationId: user.organizationId ?? '__none__' }
      : user.role === 'AUDITOR'
      // 委員不顯示開立中(DRAFT)週期(對齊 access-policy 'cycle.access';dashboard 同步)
      ? { assignments: { some: { auditorId: user.id } }, status: { not: 'DRAFT' } }
      : user.role === 'OBSERVER'
      // 觀察員(批30):限被配對之週期(CycleObserver),同樣不顯示開立中
      ? { observers: { some: { observerId: user.id } }, status: { not: 'DRAFT' } }
      // 未知角色 fail-closed(對齊 nav/cycles;避免未來新角色落入全機關)
      : user.role === 'SUPER_ADMIN' ? {} : { id: '__none__' };

  const cycles = await prisma.auditCycle.findMany({
    where,
    include: {
      organization: true,
      deficiencies: { select: { id: true, reviewerAuditorId: true, action: { select: { status: true } } } },
      // 委員視角:帶出本人於各週期受指派的構面(卡片標註負責構面);其他角色查無、回空陣列
      assignments: { where: { auditorId: user.id }, select: { dimensions: true } },
    },
    orderBy: [{ year: 'desc' }, { createdAt: 'desc' }],
  });

  // 卡片排序(批62):①年度新到舊——當前/最新年度置頂,免年度一多把「正在跑的那年」往下擠
  //(原以實地稽核日期為主排序會讓舊年度〔日期較早〕反而在上,與「當前工作優先」相反);
  // ②同年內仍依實地稽核日期近期優先(未設定者最後),保留依時程掃讀。
  const byOnsite = [...cycles].sort((a, b) => {
    if (a.year !== b.year) return b.year - a.year;
    const ta = a.onsiteDate ? a.onsiteDate.getTime() : Number.POSITIVE_INFINITY;
    const tb = b.onsiteDate ? b.onsiteDate.getTime() : Number.POSITIVE_INFINITY;
    return ta - tb || b.createdAt.getTime() - a.createdAt.getTime();
  });

  // 中心:列表頁就地開立年度週期(UAT 回饋:免繞 /admin/cycles 後台)——沿用批次開立精靈
  const isCenter = user.role === 'SUPER_ADMIN';
  const createOrgs = isCenter
    ? await prisma.organization.findMany({
        orderBy: { createdAt: 'asc' },
        include: { cycles: { select: { year: true } } },
      })
    : [];
  const createVersions = isCenter
    ? await prisma.checklistVersion.findMany({
        where: { isActive: true },
        orderBy: { year: 'desc' },
        select: { id: true, name: true, year: true },
      })
    : [];

  // 年度做成頁籤分類(取代標題上的年度);民國年呈現
  // 年度頁籤升冪(全部 → 115 → 116…,由舊到新如時間軸;列表本身仍最新年在前)
  const years = [...new Set(cycles.map((c) => c.year))].sort((a, b) => a - b);
  const selYear = searchParams.year && years.includes(Number(searchParams.year)) ? Number(searchParams.year) : null;
  const shown = selYear ? byOnsite.filter((c) => c.year === selYear) : byOnsite;

  const yearTab = (active: boolean) =>
    cn(
      'inline-flex items-center min-h-9 px-3.5 rounded-full text-label-lg focus-ring transition-colors tabular-nums',
      active ? 'bg-focus-wash text-primary-700 font-medium' : 'text-ink-500 hover:bg-paper-sunk',
    );

  return (
    <AppShell
      user={{ name: user.name, email: user.email, role: user.role, organizationName: user.organizationName }}
      crumbs={[{ label: '總覽', href: '/dashboard' }, { label: '稽核週期' }]}
    >
      <header className="mb-4 flex items-center justify-between gap-3">
        <h1 className="text-headline text-ink-900">稽核週期</h1>
        <div className="flex items-center gap-3">
          <span className="text-caption text-ink-500">共 {shown.length} 筆</span>
          {isCenter && (
            <BatchCreateCycles
              orgs={createOrgs.map((o) => ({ id: o.id, name: o.name, years: o.cycles.map((c) => c.year) }))}
              versions={createVersions}
              defaultYear={years.length ? Math.max(...years) : new Date().getFullYear()}
            />
          )}
        </div>
      </header>

      {years.length > 0 && (
        <div className="mb-6 flex items-center gap-2 flex-wrap">
          <span className="text-caption text-ink-500 mr-0.5">年度</span>
          <Link href="/cycles" aria-current={selYear === null ? 'page' : undefined} className={yearTab(selYear === null)}>
            全部
          </Link>
          {years.map((y) => (
            <Link key={y} href={`/cycles?year=${y}`} aria-current={selYear === y ? 'page' : undefined} className={yearTab(selYear === y)}>
              {y - 1911}
            </Link>
          ))}
        </div>
      )}

      {shown.length === 0 ? (
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
          {shown.map((c) => {
            // 委員的卡片「矯正通過 X/Y」只計指派給本人審閱的缺失(UAT 批66,與週期頁/清單頁一致);中心/機關看全部
            const cardDefs = user.role === 'AUDITOR'
              ? c.deficiencies.filter((d) => d.reviewerAuditorId === user.id)
              : c.deficiencies;
            const total = cardDefs.length;
            const passed = cardDefs.filter((d) => d.action?.status === 'PASSED').length;
            const orgName = c.organization.shortName?.trim() || c.organization.name;
            const auditorDims = user.role === 'AUDITOR'
              ? parseAssignDimensions(c.assignments?.[0]?.dimensions).map((d) => ASSIGN_ASPECT_LABELS[d])
              : [];
            // 委員/觀察員於結案後不可再進入(access-policy cycle.access);清單顯示已結案、卡片鎖定不可點
            const lockedForAuditor = (user.role === 'AUDITOR' || user.role === 'OBSERVER') && c.status === 'CLOSED';
            const card = (
                <Card interactive={!lockedForAuditor} variant="elevated" className={lockedForAuditor ? 'bg-paper-sunk' : undefined}>
                  <div className="flex items-center justify-between gap-3 mb-4">
                    <div className="min-w-0">
                      <p className="text-title text-ink-900 truncate" title={c.organization.name}>
                        {orgName}
                      </p>
                      {/* 稽核時程(非文件繳交期限):實地稽核日期為主要識別,做明顯;技術檢測次之 */}
                      <p className="mt-1 text-body-sm">
                        {c.onsiteDate ? (
                          <span className="font-medium text-primary-700 tabular-nums">實地稽核 {fmtROC(c.onsiteDate)}</span>
                        ) : (
                          <span className="text-ink-500">實地稽核日期未定</span>
                        )}
                        {c.techCheckDate && (
                          <span className="text-ink-500 tabular-nums"> · 技術檢測 {fmtROC(c.techCheckDate)}</span>
                        )}
                      </p>
                      <p className="text-caption text-ink-500 mt-0.5">
                        {c.dueDate ? `矯正截止 ${fmtROC(c.dueDate)}` : '尚未設定矯正截止日期'}
                      </p>
                      {auditorDims.length > 0 && (
                        <p className="text-caption text-primary-700 mt-1">負責構面：{auditorDims.join('、')}</p>
                      )}
                    </div>
                    <div className="flex flex-col items-end gap-1.5 shrink-0">
                      <Chip tone={cycleStatusTone(c.status as CycleStatus)} size="sm" dot>
                        {CYCLE_STATUS_LABELS[c.status as CycleStatus]}
                      </Chip>
                      <DeadlineChip status={c.status} dueDate={c.dueDate} allPassed={total > 0 && passed === total} />
                    </div>
                  </div>
                  {total > 0 ? (
                    <>
                      <ProgressBar value={passed} max={total} tone="primary" size="sm" />
                      <div className="mt-2 flex items-center justify-between text-caption">
                        <span className="text-ink-500">
                          矯正通過{' '}
                          <span className="font-semibold text-ink-900 tabular-nums">{passed}</span>
                          <span> / {total}</span>
                        </span>
                        <span className="text-ink-500 tabular-nums">
                          {Math.round((passed / total) * 100)}%
                        </span>
                      </div>
                    </>
                  ) : (
                    <p className="text-caption text-ink-500">尚未發布缺失</p>
                  )}
                  {lockedForAuditor && (
                    <p className="mt-2 text-caption text-ink-500">本週期已結案，資料已鎖定，委員無法再進入檢視。</p>
                  )}
                </Card>
            );
            return lockedForAuditor ? (
              <div key={c.id} aria-disabled className="cursor-not-allowed">{card}</div>
            ) : (
              <Link key={c.id} href={`/cycles/${c.id}`}>{card}</Link>
            );
          })}
        </div>
      )}
    </AppShell>
  );
}
