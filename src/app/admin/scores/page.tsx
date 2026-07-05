import type { ReactNode } from 'react';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { prisma } from '@/lib/db';
import { auth } from '@/lib/auth';
import { AppShell } from '@/components/shell/AppShell';
import { TableScroll } from '@/components/ui/TableScroll';
import { FilterChipLink } from '@/components/ui/FilterChip';
import { Button } from '@/components/ui/Button';
import { EMPTY } from '@/lib/copy';
import { DIMENSION_LABELS, DIMENSION_ORDER } from '@/lib/dimension';
import { DIMENSION_NUM, DIMENSION_MAX_SCORE, gradeOf, GRADE_TONE, type Grade } from '@/lib/audit-score';
import type { Dimension } from '@/lib/types';
import { toneClasses } from '@/lib/stage';
import { cn } from '@/lib/cn';

const GRADE_ORDER: Grade[] = ['優', '良', '佳', '可', '待改進'];

export const dynamic = 'force-dynamic';

/** 跨院/跨年度九構面評分比較(SUPER_ADMIN 唯讀):一眼看哪院、哪構面最弱。 */
export default async function CrossOrgScoresPage({
  searchParams,
}: {
  searchParams: { year?: string; sort?: string; dir?: string };
}) {
  const session = await auth();
  if (!session) redirect('/login?callbackUrl=/admin/scores');
  if (session.user.role !== 'SUPER_ADMIN') redirect('/dashboard');
  const user = session.user;

  const yearFilter = searchParams.year ? parseInt(searchParams.year, 10) : null;
  const cycles = await prisma.auditCycle.findMany({
    where: yearFilter ? { year: yearFilter } : {},
    include: {
      organization: { select: { name: true } },
      auditScores: { select: { dimension: true, score: true } },
    },
    orderBy: [{ year: 'desc' }, { createdAt: 'asc' }],
  });
  const years = Array.from(new Set(cycles.map((c) => c.year))).sort((a, b) => b - a);

  // 每週期 × 構面:跨委員平均
  const dimAvg = (scores: { dimension: string; score: number | null }[], dim: string): number | null => {
    const vals = scores
      .filter((s) => s.dimension === dim && s.score !== null)
      .map((s) => s.score as number);
    return vals.length ? Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 10) / 10 : null;
  };
  const rows = cycles
    .filter((c) => c.auditScores.length > 0)
    .map((c) => {
      const cells = DIMENSION_ORDER.map((dim) => dimAvg(c.auditScores, dim));
      const present = cells.filter((v): v is number => v !== null);
      // 總分:九構面全評=正式總分;部分評分=已評構面小計(附 * 標註,避免看似未計算/壞掉)
      const total = present.length ? Math.round(present.reduce((a, b) => a + b, 0) * 10) / 10 : null;
      const complete = present.length === DIMENSION_ORDER.length;
      return { id: c.id, org: c.organization.name, yearROC: c.year - 1911, cells, total, complete, scored: present.length };
    });

  // 全院各構面平均(找最弱面向)
  const colAvg = DIMENSION_ORDER.map((_, i) => {
    const vals = rows.map((r) => r.cells[i]).filter((v): v is number => v !== null);
    return vals.length ? Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 10) / 10 : null;
  });

  // 全院最弱構面:以「平均/滿分」比率最低者(各構面滿分不同,需正規化才可比)
  let weakestCol = -1;
  let weakestRatio = Infinity;
  colAvg.forEach((v, i) => {
    if (v === null) return;
    const ratio = v / DIMENSION_MAX_SCORE[DIMENSION_ORDER[i] as Dimension];
    if (ratio < weakestRatio) { weakestRatio = ratio; weakestCol = i; }
  });

  // 排序(可排序表頭):sort=org|year|total|d{i};dir=asc|desc。空值一律排末。
  // 預設方向:機關 A→Z、年度新→舊、分數欄由低到高(本頁目的=找最弱,弱者先列)。
  const sortKey = searchParams.sort ?? '';
  const dir: 'asc' | 'desc' = searchParams.dir === 'asc' ? 'asc' : searchParams.dir === 'desc' ? 'desc' : 'desc';
  const defaultDir = (key: string): 'asc' | 'desc' => (key === 'org' ? 'asc' : key === 'year' ? 'desc' : 'asc');
  const sorted = [...rows];
  if (sortKey) {
    const valOf = (r: (typeof rows)[number]): number | string | null => {
      if (sortKey === 'org') return r.org;
      if (sortKey === 'year') return r.yearROC;
      if (sortKey === 'total') return r.total;
      if (sortKey.startsWith('d')) return r.cells[parseInt(sortKey.slice(1), 10)] ?? null;
      return null;
    };
    sorted.sort((a, b) => {
      const av = valOf(a);
      const bv = valOf(b);
      if (av === null && bv === null) return 0;
      if (av === null) return 1;   // 空值恆排末,與方向無關
      if (bv === null) return -1;
      const base = typeof av === 'string' && typeof bv === 'string'
        ? av.localeCompare(bv as string, 'zh-Hant')
        : (av as number) - (bv as number);
      return dir === 'asc' ? base : -base;
    });
  }

  const yearQS = yearFilter ? `year=${yearFilter}&` : '';
  const sortHref = (key: string) => {
    const nextDir = sortKey === key ? (dir === 'asc' ? 'desc' : 'asc') : defaultDir(key);
    return `/admin/scores?${yearQS}sort=${key}&dir=${nextDir}`;
  };

  return (
    <AppShell
      user={{ name: user.name, email: user.email, role: user.role, organizationName: user.organizationName }}
      crumbs={[{ label: '管理' }, { label: '跨院評分比較' }]}
    >
      <header className="mb-7">
        <h1 className="font-serif text-headline text-ink-900">跨院評分比較</h1>
        <p className="mt-2 text-body-sm text-ink-500 max-w-2xl leading-relaxed">
          各機關九大構面之委員平均評分(跨委員平均);每格附<strong className="font-medium text-ink-700">等第</strong>文字(色塊為輔),點欄位標題可排序,供中心橫向比較與聚焦輔導。
        </p>
      </header>

      {years.length > 1 && (
        <div className="mb-5 flex items-center gap-2 flex-wrap">
          <FilterChipLink href="/admin/scores" selected={!yearFilter}>全部年度</FilterChipLink>
          {years.map((y) => (
            <FilterChipLink key={y} href={`/admin/scores?year=${y}`} selected={yearFilter === y}>
              <span className="tabular-nums">{y - 1911} 年度</span>
            </FilterChipLink>
          ))}
        </div>
      )}

      {rows.length === 0 ? (
        <div className="rounded-md border border-rule bg-card px-6 py-14 text-center">
          <p className="text-title text-ink-700">{yearFilter ? EMPTY.noResults.title : '尚無評分資料'}</p>
          <p className="mx-auto mt-1.5 max-w-md text-body-sm text-ink-400">
            {yearFilter
              ? '此年度尚無已完成評分的稽核週期;試試其他年度或查看全部。'
              : '待委員於實地稽核完成評分後,此處即可橫向比較各院構面得分。'}
          </p>
          {yearFilter && (
            <div className="mt-4"><Button href="/admin/scores" variant="tonal" size="sm">全部年度</Button></div>
          )}
        </div>
      ) : (
        <>
          {/* 圖例:等第→色塊對照(色彩單獨承載語意的補強;等第文字方為準) */}
          <div className="mb-4 flex items-center gap-x-4 gap-y-1.5 flex-wrap text-caption text-ink-500">
            <span className="font-medium text-ink-700">等第</span>
            {GRADE_ORDER.map((g) => (
              <span key={g} className="inline-flex items-center gap-1.5">
                <span className={cn('h-3.5 w-3.5 rounded-sm', toneClasses(GRADE_TONE[g]).iconBg)} aria-hidden />
                {g}
              </span>
            ))}
            {weakestCol >= 0 && (
              <span className="ml-auto inline-flex items-center gap-1">
                <span className="h-2.5 w-2.5 rounded-full ring-2 ring-inset ring-danger-400 bg-danger-50" aria-hidden />
                全院最弱構面:{DIMENSION_NUM[DIMENSION_ORDER[weakestCol] as Dimension]}（{DIMENSION_LABELS[DIMENSION_ORDER[weakestCol] as Dimension]}）
              </span>
            )}
          </div>

          <div className="overflow-hidden rounded-md border border-rule bg-card">
            <TableScroll maxHeight="70vh">
              <table className="w-full text-body-sm border-collapse">
                <thead className="text-label-sm text-ink-500 bg-paper-sunk [&_th]:sticky [&_th]:top-0">
                  <tr>
                    <SortableTh keyName="org" active={sortKey === 'org'} dir={dir} href={sortHref('org')} align="left" stickyCol className="px-4">機關</SortableTh>
                    <SortableTh keyName="year" active={sortKey === 'year'} dir={dir} href={sortHref('year')}>年度</SortableTh>
                    {DIMENSION_ORDER.map((dim, i) => (
                      <SortableTh
                        key={dim}
                        keyName={`d${i}`}
                        active={sortKey === `d${i}`}
                        dir={dir}
                        href={sortHref(`d${i}`)}
                        title={DIMENSION_LABELS[dim as Dimension]}
                        weakest={i === weakestCol}
                      >
                        {DIMENSION_NUM[dim as Dimension]}
                        <span className="block text-label-sm font-normal text-on-surface-variant">滿{DIMENSION_MAX_SCORE[dim as Dimension]}</span>
                      </SortableTh>
                    ))}
                    <SortableTh keyName="total" active={sortKey === 'total'} dir={dir} href={sortHref('total')} className="px-3">總分</SortableTh>
                  </tr>
                </thead>
                <tbody>
                  {sorted.map((r) => (
                    <tr key={r.id} className="border-t border-rule hover:bg-paper-sunk transition-colors">
                      <td className="px-4 py-2 text-ink-900 whitespace-nowrap sticky left-0 z-10 bg-card">{r.org}</td>
                      <td className="px-2 py-2 text-center tabular-nums text-ink-400">{r.yearROC}</td>
                      {r.cells.map((v, i) => {
                        const dim = DIMENSION_ORDER[i] as Dimension;
                        const grade = v !== null ? gradeOf(dim, Math.round(v)) : null;
                        const tone = grade ? GRADE_TONE[grade] : 'neutral';
                        return (
                          <td
                            key={dim}
                            className={cn(
                              'px-2 py-2 text-center align-middle',
                              tone === 'neutral' ? 'text-ink-400' : toneClasses(tone).iconBg,
                              i === weakestCol && 'ring-1 ring-inset ring-danger-300',
                            )}
                          >
                            {v === null ? (
                              <span className="text-ink-300">—</span>
                            ) : (
                              <span className="inline-flex flex-col items-center leading-tight">
                                <span className="tabular-nums font-medium">{v}</span>
                                <span className="text-label-sm font-normal opacity-90">{grade}</span>
                              </span>
                            )}
                          </td>
                        );
                      })}
                      <td className="px-3 py-2 text-center tabular-nums font-semibold text-ink-900">
                        {r.total === null ? (
                          '—'
                        ) : r.complete ? (
                          r.total
                        ) : (
                          <span className="text-ink-400 font-medium" title={`僅含已評 ${r.scored}/${DIMENSION_ORDER.length} 構面之小計`}>
                            {r.total}*
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-rule-strong bg-paper-sunk font-medium text-ink-900">
                    <td className="px-4 py-2.5 sticky left-0 z-10 bg-paper-sunk" colSpan={2}>全院平均</td>
                    {colAvg.map((v, i) => (
                      <td key={i} className={cn('px-2 py-2.5 text-center tabular-nums', i === weakestCol && 'ring-1 ring-inset ring-danger-300 text-danger-700 font-semibold')}>
                        {v ?? '—'}
                      </td>
                    ))}
                    <td className="px-3 py-2.5 text-center tabular-nums">
                      {(() => {
                        const present = colAvg.filter((v): v is number => v !== null);
                        if (present.length === 0) return '—';
                        const sum = Math.round(present.reduce((a, b) => a + b, 0) * 10) / 10;
                        return present.length === colAvg.length
                          ? sum
                          : <span className="text-ink-400" title={`僅含已評 ${present.length}/${colAvg.length} 構面之小計`}>{sum}*</span>;
                      })()}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </TableScroll>
          </div>
        </>
      )}

      <p className="mt-4 text-caption text-ink-400">
        註:此為螢幕比較工具;正式分數以各委員附件17 評分表為準。「九」為評核項(AuditScore.dimension),與缺失之三構面(策略/管理/技術)不同軸。
        帶 * 之總分為「已評構面小計」(尚有構面未評分,九構面全評後即為正式總分)。
      </p>
      <Link href="/admin/cycles" className="mt-2 inline-block text-caption text-primary-700 hover:underline">← 回跨院週期總覽</Link>
    </AppShell>
  );
}

/** 可排序表頭:整格為連結、aria-sort 標記,焦點鍵盤可達;最弱構面欄加淡背景;支援 sticky thead 與首欄凍結。 */
function SortableTh({
  active,
  dir,
  href,
  children,
  align = 'center',
  title,
  weakest,
  stickyCol,
  className,
}: {
  keyName: string;
  active: boolean;
  dir: 'asc' | 'desc';
  href: string;
  children: ReactNode;
  align?: 'left' | 'center';
  title?: string;
  weakest?: boolean;
  stickyCol?: boolean;
  className?: string;
}) {
  return (
    <th
      scope="col"
      aria-sort={active ? (dir === 'asc' ? 'ascending' : 'descending') : 'none'}
      title={title}
      className={cn(
        'py-3 font-medium',
        align === 'left' ? 'text-left' : 'text-center',
        // 單一 bg / z 類別(避免同格兩個同性質工具互相覆寫的不確定性)
        weakest ? 'bg-danger-50/60' : 'bg-paper-sunk',
        stickyCol ? 'sticky left-0 z-30' : 'z-20',
        className,
      )}
    >
      <Link
        href={href}
        className={cn(
          'group inline-flex items-center gap-1 rounded px-1 -mx-1 focus-ring hover:text-ink-900 transition-colors',
          active && 'text-ink-900',
        )}
      >
        <span>{children}</span>
        <span aria-hidden className={cn('shrink-0 text-[10px] leading-none', active ? 'opacity-100' : 'opacity-0 group-hover:opacity-40')}>
          {active && dir === 'asc' ? '▲' : '▼'}
        </span>
      </Link>
    </th>
  );
}
