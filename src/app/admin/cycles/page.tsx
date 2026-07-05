import Link from 'next/link';
import { prisma } from '@/lib/db';
import { auth } from '@/lib/auth';
import { fmtROC } from '@/lib/date';
import { AppShell } from '@/components/shell/AppShell';
import { Button } from '@/components/ui/Button';
import { Menu } from '@/components/ui/Menu';
import { FilterChipLink, FilterChipCount } from '@/components/ui/FilterChip';
import { FileText } from '@/components/icons';
import { TONE } from '@/lib/tone';
import { CYCLE_STATUS_LABELS, cycleStatusTone } from '@/lib/state-machine';
import type { CycleStatus } from '@/lib/types';
import BatchCreateCycles from './BatchCreateCycles';
import BatchAssignAuditors from './BatchAssignAuditors';

/* 靜謐文件工作坊(批 B2)——跨院巡檢台重塑為活文件:襯線大標 + calm 讀數卡 + 髮絲帳冊表。
   落後列以實心左緣規線 + 文字雙載(逾期/停滯 N 天)秒辨,不再靠 chip 海。功能與 IA 全保留、不新增端點。 */
function Readout({ label, value, sub, tone }: { label: string; value: string; sub: string; tone?: 'danger' | 'success' }) {
  const valueColor = tone === 'danger' ? 'text-danger-600' : tone === 'success' ? 'text-success-700' : 'text-ink-900';
  return (
    <div className="rounded-md border border-rule bg-card px-5 py-4">
      <div className="text-body-sm text-ink-500">{label}</div>
      <div className={`mt-1.5 text-headline font-semibold tabular-nums ${valueColor}`}>{value}</div>
      <div className="mt-1 text-caption text-ink-500 tabular-nums">{sub}</div>
    </div>
  );
}

export default async function AdminCyclesPage({
  searchParams,
}: {
  searchParams: { year?: string; behind?: string };
}) {
  const session = await auth();
  const user = session!.user;

  const [cycles, orgs, versions, auditors] = await Promise.all([
    prisma.auditCycle.findMany({
      include: {
        organization: true,
        deficiencies: { include: { action: { select: { status: true } } } },
        assignments: true,
      },
      orderBy: [{ year: 'desc' }, { createdAt: 'desc' }],
    }),
    prisma.organization.findMany({
      orderBy: { createdAt: 'asc' },
      include: { cycles: { select: { year: true } } },
    }),
    prisma.checklistVersion.findMany({
      where: { isActive: true },
      orderBy: { year: 'desc' },
      select: { id: true, name: true, year: true },
    }),
    prisma.user.findMany({
      where: { role: 'AUDITOR', isActive: true },
      select: { id: true, name: true, organizationId: true },
      orderBy: { name: 'asc' },
    }),
  ]);

  const years = Array.from(new Set(cycles.map((c) => c.year))).sort((a, b) => b - a);
  const yearFilter = searchParams.year ? parseInt(searchParams.year, 10) : null;
  const filtered = yearFilter ? cycles.filter((c) => c.year === yearFilter) : cycles;
  const now = new Date();
  const behindOnly = searchParams.behind === '1';

  // 停滯:進行中階段距上次狀態變動(updatedAt)的天數,門檻 14/30 天
  const STALL_WARN = 14;
  const STALL_DANGER = 30;
  const rows = filtered.map((c) => {
    const total = c.deficiencies.length;
    const passed = c.deficiencies.filter((d) => (d.action?.status ?? 'PENDING') === 'PASSED').length;
    const returned = c.deficiencies.filter((d) => (d.action?.status ?? 'PENDING') === 'RETURNED').length;
    const allPassed = total > 0 && passed === total;
    const overdue = c.status === 'REMEDIATION' && !allPassed && !!c.dueDate && new Date(c.dueDate) < now;
    const activeStage =
      ['PREPARATION', 'READY', 'ONSITE', 'REPORT_ISSUED'].includes(c.status) ||
      (c.status === 'REMEDIATION' && !allPassed);
    const stallDays = Math.floor((now.getTime() - new Date(c.updatedAt).getTime()) / 86400000);
    const stalled = activeStage && stallDays >= STALL_WARN;
    return { c, total, passed, returned, allPassed, overdue, activeStage, stallDays, stalled, behind: overdue || stalled };
  });
  const shown = behindOnly ? rows.filter((r) => r.behind) : rows;
  const behindCount = rows.filter((r) => r.behind).length;
  const behindHref = (b: boolean) => {
    const p = new URLSearchParams();
    if (yearFilter) p.set('year', String(yearFilter));
    if (b) p.set('behind', '1');
    const q = p.toString();
    return q ? `/admin/cycles?${q}` : '/admin/cycles';
  };

  // 跨院 KPI strip(中心一眼掌握:在辦 / 落後 / 矯正完成率;隨年度篩選連動)
  const activeCount = rows.filter((r) => r.activeStage).length;
  const withDef = rows.filter((r) => r.total > 0);
  const avgPass = withDef.length
    ? Math.round((withDef.reduce((a, r) => a + r.passed / r.total, 0) / withDef.length) * 100)
    : 0;

  const defaultYear = years[0] ?? new Date().getFullYear();
  const cycleOptions = cycles.map((c) => ({
    id: c.id,
    label: `${c.year - 1911} 年度 · ${c.organization.name}`,
    organizationId: c.organizationId,
    status: c.status as CycleStatus,
  }));

  const behindLede = behindOnly
    ? '只列逾期或停滯超過 14 天的週期。逾期以實心紅左緣、停滯以琥珀左緣標示,右方「開啟」進入該週期辦理。'
    : '跨機關進度一覽。逾期與停滯的週期以左緣色條與文字標出,右方「開啟」進入辦理。';

  return (
    <AppShell
      user={{ name: user.name, email: user.email, role: user.role, organizationName: user.organizationName }}
      crumbs={[{ label: '管理' }, { label: '跨院週期總覽' }]}
    >
      {/* ── 文件大標(襯線)+ 動作 ── */}
      <header className="mb-7 flex items-start justify-between gap-4 flex-wrap">
        <div className="min-w-0">
          <h1 className="font-serif text-headline text-ink-900">跨院週期總覽</h1>
          <p className="mt-2 text-body-sm text-ink-500 max-w-xl leading-relaxed">
            跨機關年度稽核進度總覽:一眼掌握誰在辦、誰落後、矯正完成率。
          </p>
        </div>
        <div className="flex gap-2 flex-wrap shrink-0">
          <BatchCreateCycles
            orgs={orgs.map((o) => ({ id: o.id, name: o.name, years: o.cycles.map((c) => c.year) }))}
            versions={versions}
            defaultYear={defaultYear}
          />
          <BatchAssignAuditors auditors={auditors} cycles={cycleOptions} />
          <Button size="sm" variant="tonal" href="/admin/scores">跨院評分比較</Button>
          <Menu
            label="下載 Excel"
            variant="outlined"
            size="sm"
            items={[
              { label: '彙整表', icon: <FileText size={15} />, href: yearFilter ? `/api/admin/export/summary?year=${yearFilter}` : '/api/admin/export/summary' },
              { label: '歷年重複缺失', icon: <FileText size={15} />, href: yearFilter ? `/api/admin/export/repeat-offender?year=${yearFilter}` : '/api/admin/export/repeat-offender' },
            ]}
          />
        </div>
      </header>

      {/* ── 當前態勢:三讀數卡 ── */}
      <section className="mb-8">
        <div className="mb-3 font-serif text-title text-ink-500">當前態勢</div>
        <div className="grid gap-3 sm:grid-cols-3">
          <Readout label="進行中週期" value={String(activeCount)} sub={yearFilter ? `${yearFilter - 1911} 年度` : '全部年度'} />
          <Readout label="落後(逾期 / 停滯)" value={String(behindCount)} sub={behindCount > 0 ? '需介入催辦' : '都在進度內'} tone={behindCount > 0 ? 'danger' : undefined} />
          <Readout label="平均矯正完成率" value={`${avgPass}%`} sub={`${withDef.length} 個週期已發布缺失`} tone="success" />
        </div>
      </section>

      {/* ── 週期清單:篩選 + 髮絲帳冊表 ── */}
      <section>
        <div className="mb-3 flex items-end justify-between gap-3 flex-wrap">
          <div className="font-serif text-title text-ink-500">{behindOnly ? '落後段落' : '週期清單'}</div>
          <div className="flex items-center gap-2 flex-wrap" role="group" aria-label="篩選落後">
            <FilterChipLink href={behindHref(false)} selected={!behindOnly}>全部</FilterChipLink>
            <FilterChipLink href={behindHref(true)} selected={behindOnly}>
              只看落後(逾期/停滯) <FilterChipCount selected={behindOnly}>{behindCount}</FilterChipCount>
            </FilterChipLink>
          </div>
        </div>

        {years.length > 1 && (
          <div className="mb-3 flex items-center gap-2 flex-wrap">
            <FilterChipLink href="/admin/cycles" selected={!yearFilter}>全部年度</FilterChipLink>
            {years.map((y) => (
              <FilterChipLink key={y} href={`/admin/cycles?year=${y}`} selected={yearFilter === y}>
                <span className="tabular-nums">{y - 1911} 年度</span>
              </FilterChipLink>
            ))}
          </div>
        )}

        <p className="mb-3 text-caption text-ink-500 leading-relaxed max-w-2xl">{behindLede}</p>

        {shown.length === 0 ? (
          <div className="rounded-md border border-rule bg-card px-6 py-14 text-center">
            <p className="text-title text-ink-700">{behindOnly ? '目前沒有落後的週期' : '尚無稽核週期'}</p>
            <p className="mt-1.5 text-body-sm text-ink-500">
              {behindOnly ? '所有進行中的週期都在進度內。' : '用右上角「批次開立年度週期」一次建立,或到醫院管理逐家開立。'}
            </p>
          </div>
        ) : (
          <div className="overflow-hidden rounded-md border border-rule bg-card">
            <div className="overflow-x-auto">
              <table className="w-full text-body-sm">
                <thead>
                  <tr className="border-b border-rule-strong bg-paper-sunk text-left text-caption text-ink-500">
                    <th className="px-4 py-2.5 font-medium">年度</th>
                    <th className="px-4 py-2.5 font-medium">機關</th>
                    <th className="px-4 py-2.5 font-medium">狀態</th>
                    <th className="px-4 py-2.5 font-medium w-56">矯正進度</th>
                    <th className="px-4 py-2.5 font-medium text-right">委員</th>
                    <th className="px-4 py-2.5 font-medium text-right">截止</th>
                    <th className="px-4 py-2.5 font-medium text-right">停滯</th>
                    <th className="px-4 py-2.5 font-medium text-right">開啟</th>
                  </tr>
                </thead>
                <tbody>
                  {shown.map((r) => {
                    const { c, total, passed, returned, allPassed, overdue, stalled, stallDays } = r;
                    const leftRule = overdue ? 'border-l-[3px] border-l-danger-600' : stalled ? 'border-l-[3px] border-l-warning-600' : 'border-l-[3px] border-l-transparent';
                    return (
                      <tr key={c.id} className="border-b border-rule last:border-b-0 hover:bg-paper-sunk transition-colors">
                        <td className={`px-4 py-3 tabular-nums font-medium text-ink-900 ${leftRule}`}>{c.year - 1911}</td>
                        <td className="px-4 py-3 text-ink-900">{c.organization.name}</td>
                        <td className="px-4 py-3">
                          <span className="inline-flex items-center gap-1.5">
                            <span className={`w-1.5 h-1.5 rounded-full ${TONE[cycleStatusTone(c.status as CycleStatus)].dot}`} aria-hidden />
                            <span className="text-ink-700">{CYCLE_STATUS_LABELS[c.status as CycleStatus]}</span>
                            {overdue && <span className="text-danger-600 font-medium">· 已逾期</span>}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          {total === 0 ? (
                            <span className="text-caption text-ink-500">尚未發布缺失</span>
                          ) : (
                            <div className="min-w-40">
                              <div className="h-1.5 rounded-full bg-paper-sunk overflow-hidden">
                                <div className={`h-full rounded-full ${allPassed ? 'bg-success-500' : 'bg-primary-500'}`} style={{ width: `${Math.round((passed / total) * 100)}%` }} />
                              </div>
                              <p className="mt-1 text-caption text-ink-500 tabular-nums">
                                通過 {passed}/{total}
                                {returned > 0 && <span className="text-danger-600"> · 退回 {returned}</span>}
                              </p>
                            </div>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums text-ink-700">{c.assignments.length}</td>
                        <td className={`px-4 py-3 text-right tabular-nums ${overdue ? 'text-danger-600 font-medium' : 'text-ink-500'}`}>{fmtROC(c.dueDate)}</td>
                        <td className="px-4 py-3 text-right">
                          {stalled ? (
                            <span className={`tabular-nums font-medium ${stallDays >= STALL_DANGER ? 'text-danger-600' : 'text-warning-700'}`}>停滯 {stallDays} 天</span>
                          ) : (
                            <span className="text-ink-500">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <Link href={`/cycles/${c.id}`} className="font-medium text-primary-700 hover:underline">開啟</Link>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </section>
    </AppShell>
  );
}
