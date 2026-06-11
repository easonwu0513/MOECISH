import { prisma } from '@/lib/db';
import { DIMENSION_LABELS } from '@/lib/dimension';
import {
  DEFICIENCY_ASPECT_LABELS,
  type DeficiencyAspect,
  type Dimension,
} from '@/lib/types';
import {
  ASPECT_DIMENSIONS, DIMENSION_MAX_SCORE, DIMENSION_NUM,
  computeDimStats, gradeOf,
  FINDING_KIND_LABELS, FINDING_KIND_HINTS, type FindingKind,
} from '@/lib/audit-score';

const ASPECTS: DeficiencyAspect[] = ['STRATEGY', 'MANAGEMENT', 'TECHNICAL'];
const KINDS: FindingKind[] = ['COMPLIANCE', 'IMPROVE', 'SUGGEST'];
const ASPECT_NUM: Record<DeficiencyAspect, string> = { STRATEGY: '一', MANAGEMENT: '二', TECHNICAL: '三' };

export async function loadAuditReport(cycleId: string) {
  const cycle = await prisma.auditCycle.findUnique({
    where: { id: cycleId },
    include: {
      organization: true,
      assignments: { include: { auditor: { select: { id: true, name: true } } } },
      checklistVersion: { include: { items: { select: { id: true, dimension: true } } } },
      responses: { select: { checklistItemId: true, compliance: true } },
      auditScores: true,
      auditFindings: {
        include: { auditor: { select: { id: true, name: true } } },
        orderBy: [{ aspect: 'asc' }, { kind: 'asc' }, { createdAt: 'asc' }],
      },
    },
  });
  return cycle;
}

export type AuditReportData = NonNullable<Awaited<ReturnType<typeof loadAuditReport>>>;

/** 彙整報告本體(畫面與列印共用;純 server component)。 */
export function ReportBody({ data }: { data: AuditReportData }) {
  const yearROC = data.year - 1911;
  const stats = computeDimStats(data.checklistVersion.items, data.responses);

  // 有評分或被指派的委員(穩定排序)
  const auditorById = new Map(data.assignments.map((a) => [a.auditor.id, a.auditor.name]));
  for (const s of data.auditScores) {
    if (!auditorById.has(s.auditorId)) auditorById.set(s.auditorId, '(已移除委員)');
  }
  const auditors = Array.from(auditorById.entries()).map(([id, name]) => ({ id, name }));

  const scoreOf = (auditorId: string, dim: Dimension): number | null =>
    data.auditScores.find((s) => s.auditorId === auditorId && s.dimension === dim)?.score ?? null;

  const totalOf = (auditorId: string): number | null => {
    const mine = data.auditScores.filter((s) => s.auditorId === auditorId);
    return mine.length > 0 ? mine.reduce((a, s) => a + s.score, 0) : null;
  };

  const avgOf = (dim: Dimension): number | null => {
    const vals = auditors
      .map((a) => scoreOf(a.id, dim))
      .filter((v): v is number => v !== null);
    if (vals.length === 0) return null;
    return Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 10) / 10;
  };

  const totals = auditors.map((a) => totalOf(a.id)).filter((v): v is number => v !== null);
  const avgTotal = totals.length > 0
    ? Math.round((totals.reduce((a, b) => a + b, 0) / totals.length) * 10) / 10
    : null;

  return (
    <div className="flex flex-col gap-8">
      {/* ── 評分總表 ── */}
      <section>
        <h2 className="text-title-lg text-on-surface mb-3">稽核評分</h2>
        <div className="overflow-x-auto rounded-md border border-outline-variant/60">
          <table className="w-full text-body-sm border-collapse">
            <thead>
              <tr className="bg-surface-container-low text-label-sm text-on-surface-variant">
                <th className="px-3 py-2.5 text-left font-medium border-b border-outline-variant/60">構面</th>
                <th className="px-3 py-2.5 text-left font-medium border-b border-outline-variant/60">稽核項目(配分)</th>
                <th className="px-2 py-2.5 text-center font-medium border-b border-outline-variant/60">題數</th>
                <th className="px-2 py-2.5 text-center font-medium border-b border-outline-variant/60">符合</th>
                <th className="px-2 py-2.5 text-center font-medium border-b border-outline-variant/60">部分</th>
                <th className="px-2 py-2.5 text-center font-medium border-b border-outline-variant/60">不符</th>
                <th className="px-2 py-2.5 text-center font-medium border-b border-outline-variant/60">不適</th>
                {auditors.map((a) => (
                  <th key={a.id} className="px-3 py-2.5 text-center font-medium border-b border-outline-variant/60 whitespace-nowrap">
                    {a.name}
                  </th>
                ))}
                <th className="px-3 py-2.5 text-center font-medium border-b border-outline-variant/60">平均</th>
              </tr>
            </thead>
            <tbody>
              {ASPECTS.flatMap((aspect) =>
                ASPECT_DIMENSIONS[aspect].map((dim, i) => {
                  const st = stats[dim] ?? { total: 0, c1: 0, c2: 0, c3: 0, c4: 0 };
                  const avg = avgOf(dim);
                  return (
                    <tr key={dim} className="border-b border-outline-variant/40 last:border-b-0">
                      {i === 0 && (
                        <td rowSpan={3} className="px-3 py-2.5 align-middle text-on-surface font-medium border-r border-outline-variant/40 whitespace-nowrap">
                          {DEFICIENCY_ASPECT_LABELS[aspect]}
                        </td>
                      )}
                      <td className="px-3 py-2.5 text-on-surface">
                        {DIMENSION_NUM[dim]}、{DIMENSION_LABELS[dim]}
                        <span className="text-on-surface-variant">({DIMENSION_MAX_SCORE[dim]})</span>
                      </td>
                      <td className="px-2 py-2.5 text-center tabular-nums">{st.total}</td>
                      <td className="px-2 py-2.5 text-center tabular-nums">{st.c1}</td>
                      <td className="px-2 py-2.5 text-center tabular-nums">{st.c2}</td>
                      <td className="px-2 py-2.5 text-center tabular-nums">{st.c3}</td>
                      <td className="px-2 py-2.5 text-center tabular-nums">{st.c4}</td>
                      {auditors.map((a) => {
                        const v = scoreOf(a.id, dim);
                        return (
                          <td key={a.id} className="px-3 py-2.5 text-center tabular-nums">
                            {v ?? '—'}
                          </td>
                        );
                      })}
                      <td className="px-3 py-2.5 text-center tabular-nums font-medium">
                        {avg ?? '—'}
                        {avg !== null && (
                          <span className="ml-1 text-caption text-on-surface-variant">
                            {gradeOf(dim, Math.round(avg))}
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                }),
              )}
              <tr className="bg-surface-container-low font-medium">
                <td colSpan={7} className="px-3 py-2.5 text-right">得分(滿分 100)</td>
                {auditors.map((a) => (
                  <td key={a.id} className="px-3 py-2.5 text-center tabular-nums">{totalOf(a.id) ?? '—'}</td>
                ))}
                <td className="px-3 py-2.5 text-center tabular-nums">{avgTotal ?? '—'}</td>
              </tr>
            </tbody>
          </table>
        </div>
        {auditors.length === 0 && (
          <p className="mt-2 text-body-sm text-on-surface-variant">尚未指派稽核委員。</p>
        )}
      </section>

      {/* ── 稽核發現(全體委員彙整)── */}
      <section>
        <h2 className="text-title-lg text-on-surface mb-3">稽核發現</h2>
        {data.auditFindings.length === 0 ? (
          <p className="text-body-sm text-on-surface-variant">尚無稽核發現。</p>
        ) : (
          <div className="flex flex-col gap-6">
            {ASPECTS.map((aspect) => {
              const inAspect = data.auditFindings.filter((f) => f.aspect === aspect);
              if (inAspect.length === 0) return null;
              return (
                <div key={aspect}>
                  <h3 className="text-title text-on-surface mb-2">
                    {ASPECT_NUM[aspect]}、{DEFICIENCY_ASPECT_LABELS[aspect]}
                  </h3>
                  <div className="flex flex-col gap-4">
                    {KINDS.map((kind) => {
                      const list = inAspect.filter((f) => f.kind === kind);
                      if (list.length === 0) return null;
                      return (
                        <div key={kind} className="rounded-md border border-outline-variant/50">
                          <div className="px-4 py-2 bg-surface-container-low text-label text-on-surface-variant border-b border-outline-variant/40">
                            {FINDING_KIND_LABELS[kind]}
                            <span className="ml-2 font-normal">{FINDING_KIND_HINTS[kind]}</span>
                          </div>
                          <ol className="list-decimal pl-9 pr-4 py-3 flex flex-col gap-2">
                            {list.map((f) => (
                              <li key={f.id} className="text-body text-on-surface leading-relaxed">
                                <span className="whitespace-pre-wrap">{f.content}</span>
                                <span className="ml-2 text-caption text-on-surface-variant whitespace-nowrap">
                                  {f.checklistRef ? `(檢核項次 ${f.checklistRef})` : ''}
                                  {' '}— {f.auditor.name}
                                  {f.deficiencyId ? ' · 已轉入缺失管考' : ''}
                                </span>
                              </li>
                            ))}
                          </ol>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
