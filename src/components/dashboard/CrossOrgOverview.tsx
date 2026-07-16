'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { Chip } from '@/components/ui/Chip';
import { CYCLE_STATUS_LABELS, cycleStatusTone } from '@/lib/state-machine';
import type { CycleStatus } from '@/lib/types';
import { toneClasses } from '@/lib/stage';
import { cn } from '@/lib/cn';
import RemindButton from '@/components/cycle/RemindButton';

export type OverviewRow = {
  id: string;
  orgName: string;
  year: number;
  yearROC: number;
  overdue: boolean;
  step: number;
  status: CycleStatus;
  remindLast: string | null;
  remindCount: number;
};

const MAX_ROWS = 8;

/**
 * 中心「跨院週期總覽」——依年度頁籤分類(client 即時過濾)。
 * 原為扁平 top-8,年份一多會變一長條難找;加年度籤(全部 → 115 → 116…升冪,與全站年度選擇器一致),
 * 各年內仍逾期優先、階段序;逾期一鍵催辦與「查看全部」隨當前檢視連動。
 */
export function CrossOrgOverview({
  rows,
  overdueOrgIds,
  overdueCount,
}: {
  rows: OverviewRow[];
  overdueOrgIds: string[];
  overdueCount: number;
}) {
  const years = useMemo(() => Array.from(new Set(rows.map((r) => r.year))).sort((a, b) => a - b), [rows]);
  const [year, setYear] = useState<number | null>(null); // null = 全部年度

  const filtered = year === null ? rows : rows.filter((r) => r.year === year);
  const shown = [...filtered]
    .sort((a, b) => Number(b.overdue) - Number(a.overdue) || a.step - b.step)
    .slice(0, MAX_ROWS);

  const tabCls = (active: boolean) =>
    cn(
      'inline-flex items-center min-h-8 px-3 rounded-full text-label focus-ring transition-colors tabular-nums',
      active ? 'bg-focus-wash text-primary-700 font-medium' : 'text-ink-500 hover:bg-paper-sunk',
    );

  return (
    <section className="mb-6 rounded-lg border border-rule bg-card shadow-elev-1 overflow-hidden">
      <div className="flex items-center justify-between gap-3 flex-wrap px-4 py-3 border-b border-rule">
        <p className="text-label-sm font-medium uppercase tracking-[0.08em] text-ink-500">跨院週期總覽 · {rows.length} 個週期</p>
        <span className="text-caption text-ink-500">左色條 = 階段；逾期以紅標示</span>
      </div>

      {years.length > 1 && (
        <div className="flex items-center gap-1.5 flex-wrap px-4 py-2.5 border-b border-rule">
          <span className="text-caption text-ink-500 mr-0.5">年度</span>
          <button type="button" onClick={() => setYear(null)} className={tabCls(year === null)} aria-pressed={year === null}>
            全部
          </button>
          {years.map((y) => (
            <button key={y} type="button" onClick={() => setYear(y)} className={tabCls(year === y)} aria-pressed={year === y}>
              {y - 1911}
            </button>
          ))}
        </div>
      )}

      {shown.length === 0 ? (
        <p className="px-4 py-6 text-center text-caption text-ink-500">此年度目前沒有週期。</p>
      ) : (
        <ul className="divide-y divide-rule">
          {shown.map((e) => {
            const tone = cycleStatusTone(e.status);
            return (
              <li
                key={e.id}
                className={cn(
                  'flex flex-wrap items-center gap-x-3 gap-y-1.5 border-l-4 px-4 py-3 transition-[border-left-width] duration-200 ease-standard hover:border-l-[6px]',
                  e.overdue ? 'border-l-danger-600 bg-danger-50' : toneClasses(tone).border,
                )}
              >
                {e.overdue && <span className="sr-only">已逾期；</span>}
                <Link href={`/cycles/${e.id}`} className="min-w-0 flex-1 hover:underline focus-ring rounded" title={e.orgName}>
                  <span className="text-body-sm text-ink-900">{e.orgName}</span>
                  <span className="text-caption text-ink-500"> · {e.yearROC} 年度</span>
                </Link>
                {e.overdue && (
                  <Chip tone="danger" size="sm" variant="filled">
                    逾期
                  </Chip>
                )}
                <Chip tone={tone} size="sm">
                  {CYCLE_STATUS_LABELS[e.status]}
                </Chip>
                {e.overdue && (
                  <RemindButton
                    cycleId={e.id}
                    orgName={e.orgName}
                    yearLabel={String(e.yearROC)}
                    lastLabel={e.remindLast}
                    remindCount={e.remindCount}
                  />
                )}
              </li>
            );
          })}
        </ul>
      )}

      {(overdueCount > 0 || filtered.length > MAX_ROWS) && (
        <div className="flex items-center justify-between gap-3 flex-wrap px-4 py-2.5 border-t border-rule">
          {overdueCount > 0 ? (
            <Link
              href={`/admin/emails?orgIds=${overdueOrgIds.join(',')}`}
              className="inline-flex items-center min-h-11 -my-1 text-caption text-danger-700 hover:underline focus-ring rounded"
            >
              ⚠ {overdueCount} 個週期矯正已逾期，一鍵催辦（已預選 {overdueOrgIds.length} 院）→
            </Link>
          ) : (
            <span />
          )}
          {filtered.length > MAX_ROWS && (
            <Link
              href={year === null ? '/admin/cycles' : `/admin/cycles?year=${year}`}
              className="inline-flex items-center min-h-11 -my-1 text-caption text-primary-700 hover:underline focus-ring rounded"
            >
              查看全部 {filtered.length} 個週期 →
            </Link>
          )}
        </div>
      )}
    </section>
  );
}
