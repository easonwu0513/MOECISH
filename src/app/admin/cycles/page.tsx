import Link from 'next/link';
import { prisma } from '@/lib/db';
import { auth } from '@/lib/auth';
import { AppShell } from '@/components/shell/AppShell';
import { Card } from '@/components/ui/Card';
import { Chip } from '@/components/ui/Chip';
import { Button } from '@/components/ui/Button';
import { ProgressBar } from '@/components/ui/ProgressBar';
import { EmptyState } from '@/components/ui/EmptyState';
import { TableScroll } from '@/components/ui/TableScroll';
import { FilterChipLink } from '@/components/ui/FilterChip';
import { ClipboardCheck } from '@/components/icons';
import { CYCLE_STATUS_LABELS, cycleStatusTone } from '@/lib/state-machine';
import type { ActionStatus, CycleStatus } from '@/lib/types';
import BatchCreateCycles from './BatchCreateCycles';

export default async function AdminCyclesPage({
  searchParams,
}: {
  searchParams: { year?: string };
}) {
  const session = await auth();
  const user = session!.user;

  const [cycles, orgs, versions] = await Promise.all([
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
  ]);

  const years = Array.from(new Set(cycles.map((c) => c.year))).sort((a, b) => b - a);
  const yearFilter = searchParams.year ? parseInt(searchParams.year, 10) : null;
  const filtered = yearFilter ? cycles.filter((c) => c.year === yearFilter) : cycles;
  const now = new Date();

  const defaultYear = years[0] ?? new Date().getFullYear();

  return (
    <AppShell
      user={{ name: user.name, email: user.email, role: user.role, organizationName: user.organizationName }}
      crumbs={[{ label: '管理', href: '/admin/organizations' }, { label: '稽核週期' }]}
    >
      <header className="mb-6 flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-headline text-on-surface">稽核週期管理</h1>
          <p className="mt-1 text-body-sm text-on-surface-variant">
            跨機關進度總覽:矯正通過率與逾期一目了然。
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <BatchCreateCycles
            orgs={orgs.map((o) => ({ id: o.id, name: o.name, years: o.cycles.map((c) => c.year) }))}
            versions={versions}
            defaultYear={defaultYear}
          />
          <Button
            size="sm"
            variant="tonal"
            href={yearFilter ? `/api/admin/export/summary?year=${yearFilter}` : '/api/admin/export/summary'}
          >
            下載彙整表(Excel)
          </Button>
        </div>
      </header>

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

      {filtered.length === 0 ? (
        <Card>
          <EmptyState
            icon={<ClipboardCheck size={28} />}
            title="尚無稽核週期"
            description="用右上角「批次開立年度週期」一次建立,或到醫院管理逐家開立。"
          />
        </Card>
      ) : (
        <Card padded={false} variant="outlined">
          <TableScroll>
          <table className="w-full text-body-sm">
            <thead className="text-label-sm uppercase tracking-wide text-on-surface-variant bg-surface-container-low">
              <tr>
                <th className="text-left px-5 py-3 font-medium">年度</th>
                <th className="text-left px-5 py-3 font-medium">機關</th>
                <th className="text-left px-5 py-3 font-medium">狀態</th>
                <th className="text-left px-5 py-3 font-medium w-56">矯正進度</th>
                <th className="text-right px-5 py-3 font-medium">委員</th>
                <th className="text-right px-5 py-3 font-medium">截止</th>
                <th className="text-right px-5 py-3 font-medium">開啟</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((c) => {
                const total = c.deficiencies.length;
                const statusOf = (s: string | undefined) => (s ?? 'PENDING') as ActionStatus;
                const passed = c.deficiencies.filter((d) => statusOf(d.action?.status) === 'PASSED').length;
                const returned = c.deficiencies.filter((d) => statusOf(d.action?.status) === 'RETURNED').length;
                const allPassed = total > 0 && passed === total;
                const overdue = c.status === 'REMEDIATION' && !allPassed && new Date(c.dueDate) < now;
                return (
                  <tr key={c.id} className="border-t border-outline-variant/60 hover:bg-surface-container-low transition-colors">
                    <td className="px-5 py-3 tabular-nums font-medium">{c.year - 1911}</td>
                    <td className="px-5 py-3">{c.organization.name}</td>
                    <td className="px-5 py-3">
                      <span className="inline-flex items-center gap-1.5 flex-wrap">
                        <Chip size="sm" tone={cycleStatusTone(c.status as CycleStatus)} dot>
                          {CYCLE_STATUS_LABELS[c.status as CycleStatus]}
                        </Chip>
                        {overdue && <Chip size="sm" tone="danger">逾期</Chip>}
                      </span>
                    </td>
                    <td className="px-5 py-3">
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
                    </td>
                    <td className="px-5 py-3 text-right tabular-nums">{c.assignments.length}</td>
                    <td className={'px-5 py-3 text-right ' + (overdue ? 'text-danger-600 font-medium' : 'text-on-surface-variant')}>
                      {new Date(c.dueDate).toLocaleDateString('zh-TW')}
                    </td>
                    <td className="px-5 py-3 text-right">
                      <Link href={`/cycles/${c.id}`} className="text-primary-700 hover:underline">開啟</Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          </TableScroll>
        </Card>
      )}
    </AppShell>
  );
}
