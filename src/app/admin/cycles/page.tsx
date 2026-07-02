import Link from 'next/link';
import { prisma } from '@/lib/db';
import { auth } from '@/lib/auth';
import { fmtROC } from '@/lib/date';
import { AppShell } from '@/components/shell/AppShell';
import { PageHeader } from '@/components/shell/PageHeader';
import { Card } from '@/components/ui/Card';
import { Chip } from '@/components/ui/Chip';
import { Button } from '@/components/ui/Button';
import { ProgressBar } from '@/components/ui/ProgressBar';
import { EmptyState } from '@/components/ui/EmptyState';
import { TableScroll } from '@/components/ui/TableScroll';
import { Table, THead, Th, Tr, Td } from '@/components/ui/DataTable';
import { FilterChipLink, FilterChipCount } from '@/components/ui/FilterChip';
import { StatTopBar } from '@/components/ui/StatTopBar';
import { ClipboardCheck, AlertTriangle, CheckCircle } from '@/components/icons';
import { CYCLE_STATUS_LABELS, cycleStatusTone } from '@/lib/state-machine';
import type { CycleStatus } from '@/lib/types';
import BatchCreateCycles from './BatchCreateCycles';
import BatchAssignAuditors from './BatchAssignAuditors';

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

  return (
    <AppShell
      user={{ name: user.name, email: user.email, role: user.role, organizationName: user.organizationName }}
      crumbs={[{ label: '管理' }, { label: '跨院週期總覽' }]}
    >
      <PageHeader
        title="跨院週期總覽"
        subtitle="跨機關進度總覽:矯正通過率與逾期一目了然。"
        actions={
          <>
            <BatchCreateCycles
              orgs={orgs.map((o) => ({ id: o.id, name: o.name, years: o.cycles.map((c) => c.year) }))}
              versions={versions}
              defaultYear={defaultYear}
            />
            <BatchAssignAuditors auditors={auditors} cycles={cycleOptions} />
            <Button size="sm" variant="tonal" href="/admin/scores">
              跨院評分比較
            </Button>
            <Button
              size="sm"
              variant="text"
              href={yearFilter ? `/api/admin/export/summary?year=${yearFilter}` : '/api/admin/export/summary'}
            >
              下載彙整表(Excel)
            </Button>
            <Button
              size="sm"
              variant="text"
              href={yearFilter ? `/api/admin/export/repeat-offender?year=${yearFilter}` : '/api/admin/export/repeat-offender'}
            >
              下載歷年重複缺失(Excel)
            </Button>
          </>
        }
      />

      {/* 跨院 KPI:中心一眼掌握在辦 / 落後 / 矯正完成率 */}
      <div className="grid gap-3 sm:grid-cols-3 mb-5">
        <StatTopBar tone="primary" icon={<ClipboardCheck size={20} />} primary={String(activeCount)} label="進行中週期" sub={yearFilter ? `${yearFilter - 1911} 年度` : '全部年度'} />
        <StatTopBar tone="danger" muted={behindCount === 0} icon={<AlertTriangle size={20} />} primary={String(behindCount)} label="落後(逾期 / 停滯)" sub={behindCount > 0 ? '需介入催辦' : '都在進度內'} />
        <StatTopBar tone="success" icon={<CheckCircle size={20} />} primary={`${avgPass}%`} label="平均矯正完成率" sub={`${withDef.length} 個週期已發布缺失`} />
      </div>

      {/* 年度篩選 */}
      {years.length > 1 && (
        <div className="mb-5 flex items-center gap-2 flex-wrap">
          <FilterChipLink href="/admin/cycles" selected={!yearFilter}>全部年度</FilterChipLink>
          {years.map((y) => (
            <FilterChipLink key={y} href={`/admin/cycles?year=${y}`} selected={yearFilter === y}>
              <span className="tabular-nums">{y - 1911} 年度</span>
            </FilterChipLink>
          ))}
        </div>
      )}

      {/* 落後篩選:中心核心是「誰落後、催誰」 */}
      <div className="mb-5 flex items-center gap-2 flex-wrap" role="group" aria-label="篩選落後">
        <FilterChipLink href={behindHref(false)} selected={!behindOnly}>全部</FilterChipLink>
        <FilterChipLink href={behindHref(true)} selected={behindOnly}>
          只看落後(逾期/停滯) <FilterChipCount selected={behindOnly}>{behindCount}</FilterChipCount>
        </FilterChipLink>
      </div>

      {shown.length === 0 ? (
        <Card>
          <EmptyState
            icon={<ClipboardCheck size={28} />}
            title={behindOnly ? '目前沒有落後的週期' : '尚無稽核週期'}
            description={behindOnly ? '所有進行中的週期都在進度內。' : '用右上角「批次開立年度週期」一次建立,或到醫院管理逐家開立。'}
          />
        </Card>
      ) : (
        <Card padded={false} variant="outlined">
          <TableScroll>
          <Table>
            <THead>
              <Th>年度</Th>
              <Th>機關</Th>
              <Th>狀態</Th>
              <Th className="w-56">矯正進度</Th>
              <Th numeric>委員</Th>
              <Th numeric>截止</Th>
              <Th numeric>停滯</Th>
              <Th numeric>開啟</Th>
            </THead>
            <tbody>
              {shown.map((r) => {
                const { c, total, passed, returned, allPassed, overdue, stalled, stallDays } = r;
                return (
                  <Tr key={c.id}>
                    <Td className="tabular-nums font-medium">{c.year - 1911}</Td>
                    <Td>{c.organization.name}</Td>
                    <Td>
                      <span className="inline-flex items-center gap-1.5 flex-wrap">
                        <Chip size="sm" tone={cycleStatusTone(c.status as CycleStatus)} dot>
                          {CYCLE_STATUS_LABELS[c.status as CycleStatus]}
                        </Chip>
                        {overdue && <Chip size="sm" tone="danger">逾期</Chip>}
                      </span>
                    </Td>
                    <Td>
                      {total === 0 ? (
                        <span className="text-caption text-on-surface-variant">尚未發布缺失</span>
                      ) : (
                        <div className="min-w-40">
                          <ProgressBar value={passed} max={total} tone={allPassed ? 'success' : 'primary'} size="sm" />
                          <p className="mt-1 text-caption text-on-surface-variant tabular-nums">
                            通過 {passed}/{total}
                            {returned > 0 && <span className="text-danger-600"> · 退回 {returned}</span>}
                          </p>
                        </div>
                      )}
                    </Td>
                    <Td numeric>{c.assignments.length}</Td>
                    <Td className={'text-right tabular-nums ' + (overdue ? 'text-danger-600 font-medium' : 'text-on-surface-variant')}>
                      {fmtROC(c.dueDate)}
                    </Td>
                    <Td className="text-right">
                      {stalled ? (
                        <Chip size="sm" tone={stallDays >= STALL_DANGER ? 'danger' : 'warning'}>停滯 {stallDays} 天</Chip>
                      ) : (
                        <span className="text-on-surface-variant">—</span>
                      )}
                    </Td>
                    <Td className="text-right">
                      <Link href={`/cycles/${c.id}`} className="text-primary-700 hover:underline">開啟</Link>
                    </Td>
                  </Tr>
                );
              })}
            </tbody>
          </Table>
          </TableScroll>
        </Card>
      )}
    </AppShell>
  );
}
