import { redirect } from 'next/navigation';
import Link from 'next/link';
import { prisma } from '@/lib/db';
import { auth } from '@/lib/auth';
import { AppShell } from '@/components/shell/AppShell';
import { Card } from '@/components/ui/Card';
import { Chip } from '@/components/ui/Chip';
import { EmptyState } from '@/components/ui/EmptyState';
import { TableScroll } from '@/components/ui/TableScroll';
import { FilterChipLink } from '@/components/ui/FilterChip';
import { Button } from '@/components/ui/Button';
import { BarChart } from '@/components/icons';
import { EMPTY } from '@/lib/copy';
import { DIMENSION_LABELS, DIMENSION_ORDER } from '@/lib/dimension';
import { DIMENSION_NUM, DIMENSION_MAX_SCORE, gradeOf, GRADE_TONE } from '@/lib/audit-score';
import type { Dimension } from '@/lib/types';

export const dynamic = 'force-dynamic';

const TONE_BG: Record<string, string> = {
  success: 'bg-success-50 text-success-700',
  sage: 'bg-sage-50 text-sage-700',
  warning: 'bg-warning-50 text-warning-700',
  danger: 'bg-danger-50 text-danger-700',
  neutral: 'text-on-surface-variant',
  primary: 'bg-primary-50 text-primary-700',
};

/** 跨院/跨年度九構面評分比較(SUPER_ADMIN 唯讀):一眼看哪院、哪構面最弱。 */
export default async function CrossOrgScoresPage({
  searchParams,
}: {
  searchParams: { year?: string };
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
  const dimAvg = (scores: { dimension: string; score: number }[], dim: string): number | null => {
    const vals = scores.filter((s) => s.dimension === dim).map((s) => s.score);
    return vals.length ? Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 10) / 10 : null;
  };
  const rows = cycles
    .filter((c) => c.auditScores.length > 0)
    .map((c) => {
      const cells = DIMENSION_ORDER.map((dim) => dimAvg(c.auditScores, dim));
      const present = cells.filter((v): v is number => v !== null);
      const total = present.length === DIMENSION_ORDER.length
        ? Math.round(present.reduce((a, b) => a + b, 0) * 10) / 10
        : null;
      return { id: c.id, org: c.organization.name, yearROC: c.year - 1911, cells, total };
    });

  // 全院各構面平均(找最弱面向)
  const colAvg = DIMENSION_ORDER.map((_, i) => {
    const vals = rows.map((r) => r.cells[i]).filter((v): v is number => v !== null);
    return vals.length ? Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 10) / 10 : null;
  });

  return (
    <AppShell
      user={{ name: user.name, email: user.email, role: user.role, organizationName: user.organizationName }}
      crumbs={[{ label: '管理' }, { label: '跨院評分比較' }]}
    >
      <header className="mb-6">
        <h1 className="text-headline text-on-surface">跨院評分比較</h1>
        <p className="mt-1 text-body-sm text-on-surface-variant leading-relaxed">
          各機關九大構面之委員平均評分(跨委員平均);色塊愈紅代表該面向愈弱,供中心橫向比較與聚焦輔導。
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
        <Card>
          {yearFilter ? (
            <EmptyState
              icon={<BarChart size={28} />}
              title={EMPTY.noResults.title}
              description="此年度尚無已完成評分的稽核週期;試試其他年度或查看全部。"
              action={<Button href="/admin/scores" variant="tonal" size="sm">全部年度</Button>}
            />
          ) : (
            <EmptyState icon={<BarChart size={28} />} title="尚無評分資料" description="待委員於實地稽核完成評分後,此處即可橫向比較各院構面得分。" />
          )}
        </Card>
      ) : (
        <Card padded={false} variant="outlined">
          <TableScroll>
            <table className="w-full text-body-sm border-collapse">
              <thead className="text-label-sm text-on-surface-variant bg-surface-container-low">
                <tr>
                  <th className="text-left px-4 py-3 font-medium sticky left-0 bg-surface-container-low">機關</th>
                  <th className="text-center px-2 py-3 font-medium">年度</th>
                  {DIMENSION_ORDER.map((dim) => (
                    <th key={dim} className="text-center px-2 py-3 font-medium" title={DIMENSION_LABELS[dim as Dimension]}>
                      {DIMENSION_NUM[dim as Dimension]}<span className="block text-[10px] font-normal text-on-surface-variant">滿{DIMENSION_MAX_SCORE[dim as Dimension]}</span>
                    </th>
                  ))}
                  <th className="text-center px-3 py-3 font-medium">總分</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="border-t border-outline-variant/60">
                    <td className="px-4 py-2.5 text-on-surface whitespace-nowrap sticky left-0 bg-surface-container-lowest">{r.org}</td>
                    <td className="px-2 py-2.5 text-center tabular-nums text-on-surface-variant">{r.yearROC}</td>
                    {r.cells.map((v, i) => {
                      const dim = DIMENSION_ORDER[i] as Dimension;
                      const tone = v !== null ? GRADE_TONE[gradeOf(dim, Math.round(v))] : 'neutral';
                      return (
                        <td key={dim} className={`px-2 py-2.5 text-center tabular-nums font-medium ${TONE_BG[tone] ?? ''}`}>
                          {v ?? '—'}
                        </td>
                      );
                    })}
                    <td className="px-3 py-2.5 text-center tabular-nums font-semibold text-on-surface">{r.total ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-outline-variant bg-surface-container-low font-medium">
                  <td className="px-4 py-2.5 sticky left-0 bg-surface-container-low" colSpan={2}>全院平均</td>
                  {colAvg.map((v, i) => (
                    <td key={i} className="px-2 py-2.5 text-center tabular-nums">{v ?? '—'}</td>
                  ))}
                  <td className="px-3 py-2.5 text-center tabular-nums">
                    {colAvg.every((v) => v !== null) ? Math.round(colAvg.reduce((a, b) => a! + b!, 0)! * 10) / 10 : '—'}
                  </td>
                </tr>
              </tfoot>
            </table>
          </TableScroll>
        </Card>
      )}

      <p className="mt-4 text-caption text-on-surface-variant">
        註:此為螢幕比較工具;正式分數以各委員附件17 評分表為準。「九」為評核項(AuditScore.dimension),與缺失之三構面(策略/管理/技術)不同軸。
      </p>
      <Link href="/admin/cycles" className="mt-2 inline-block text-caption text-primary-700 hover:underline">← 回跨院週期總覽</Link>
    </AppShell>
  );
}
