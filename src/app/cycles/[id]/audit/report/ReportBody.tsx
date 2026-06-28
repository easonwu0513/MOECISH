import { prisma } from '@/lib/db';
import { DIMENSION_LABELS } from '@/lib/dimension';
import { fmtROCDateTime } from '@/lib/date';
import { Check, AlertTriangle } from '@/components/icons';
import {
  DEFICIENCY_ASPECT_LABELS,
  type DeficiencyAspect,
  type Dimension,
} from '@/lib/types';
import {
  ASPECT_DIMENSIONS, DIMENSION_MAX_SCORE,
  computeDimStats, gradeOf, compareChecklistRef,
} from '@/lib/audit-score';
import {
  makeDefaultReportData,
  type Category, type ReportData, type SectionKey,
} from '@/components/audit-merge/lib';

const ASPECTS: DeficiencyAspect[] = ['STRATEGY', 'MANAGEMENT', 'TECHNICAL'];

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

export type ReportMeta = {
  auditDateRaw?: string;
  scope?: string;
  auditCriteria?: string[];
  lead?: { name: string; title: string };
  subLead?: { name: string; title: string; org: string };
  team?: { strategy: string[]; management: string[]; technical: string[] };
};

export function parseReportMeta(raw: string | null): ReportMeta {
  try { return raw ? (JSON.parse(raw) as ReportMeta) : {}; } catch { return {}; }
}

const ASPECT_TO_CATEGORY: Record<DeficiencyAspect, Category> = {
  STRATEGY: 'strategy', MANAGEMENT: 'management', TECHNICAL: 'technical',
};
const KIND_TO_SECTION: Record<string, SectionKey> = {
  COMPLIANCE: 'compliance', IMPROVE: 'improvements', SUGGEST: 'suggestions',
};

/** DB → 彙整工具 ReportData(版式完全對齊「稽核報告彙整工具」的 Word 格式)。 */
export function buildReportData(data: AuditReportData): ReportData {
  const meta = parseReportMeta(data.auditReportMeta);
  const base = makeDefaultReportData();

  const leadDefault =
    data.assignments.find((a) => a.role === 'LEAD')?.auditor.name ?? '';

  const findings: ReportData['findings'] = {
    strategy: { compliance: [], improvements: [], suggestions: [] },
    management: { compliance: [], improvements: [], suggestions: [] },
    technical: { compliance: [], improvements: [], suggestions: [] },
  };
  for (const f of data.auditFindings) {
    const cat = ASPECT_TO_CATEGORY[f.aspect as DeficiencyAspect];
    const sec = KIND_TO_SECTION[f.kind];
    if (!cat || !sec) continue;
    findings[cat][sec].push({
      id: f.id,
      code: f.checklistRef ?? '',
      text: f.content,
      pageBreakBefore: false,
      duplicateAcknowledged: true,
    });
  }
  // 各類別/各區段內依「對應項次」自然排序,確保預覽與列印的項次順序一致(法遵/待改善/建議各自排序)
  for (const cat of Object.keys(findings) as Category[]) {
    for (const sec of Object.keys(findings[cat]) as SectionKey[]) {
      findings[cat][sec].sort((x, y) => compareChecklistRef(x.code, y.code));
    }
  }

  return {
    ...base,
    year: String(data.year - 1911),
    hospitalName: data.organization.name,
    branchName: '',
    auditDateRaw: meta.auditDateRaw
      ?? (data.onsiteDate ? new Date(data.onsiteDate).toISOString().slice(0, 10) : ''),
    scope: meta.scope ?? base.scope,
    auditCriteria: (meta.auditCriteria && meta.auditCriteria.length > 0
      ? meta.auditCriteria
      : base.auditCriteria.map((c) => c.text)
    ).map((text, i) => ({ id: `ac${i + 1}`, text })),
    lead: meta.lead ?? { name: leadDefault, title: '' },
    subLead: meta.subLead ?? { name: '', title: '', org: '' },
    team: meta.team ?? { strategy: [], management: [], technical: [] },
    findings,
  };
}

/** 評分總覽(螢幕用;附件17 的列印是每位委員各印自己的)。 */
export function ScoreOverview({ data }: { data: AuditReportData }) {
  const stats = computeDimStats(data.checklistVersion.items, data.responses);

  const auditorById = new Map(data.assignments.map((a) => [a.auditor.id, a.auditor.name]));
  for (const s of data.auditScores) {
    if (!auditorById.has(s.auditorId)) auditorById.set(s.auditorId, '(已移除委員)');
  }
  const auditors = Array.from(auditorById.entries()).map(([id, name]) => ({ id, name }));

  const scoreOf = (auditorId: string, dim: Dimension): number | null =>
    data.auditScores.find((s) => s.auditorId === auditorId && s.dimension === dim)?.score ?? null;
  const totalOf = (auditorId: string): number | null => {
    const mine = data.auditScores.filter((s) => s.auditorId === auditorId && s.score !== null);
    return mine.length > 0 ? mine.reduce((a, s) => a + (s.score ?? 0), 0) : null;
  };
  const avgOf = (dim: Dimension): number | null => {
    const vals = auditors.map((a) => scoreOf(a.id, dim)).filter((v): v is number => v !== null);
    if (vals.length === 0) return null;
    return Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 10) / 10;
  };
  // 彙整總分 = 各構面「跨委員平均」之加總(委員可只評其負責構面;此為正式週期得分,
  // 不以「委員個人總分平均」計,避免只評部分構面的委員拉低整體)
  const ALL_DIMS = ASPECTS.flatMap((a) => ASPECT_DIMENSIONS[a]);
  const dimAvgVals = ALL_DIMS.map((d) => avgOf(d)).filter((v): v is number => v !== null);
  const aggregateTotal = dimAvgVals.length > 0
    ? Math.round(dimAvgVals.reduce((a, b) => a + b, 0) * 10) / 10
    : null;

  // 九構面是否評滿;未滿者其總分有誤導性,需明示「(已填/9)」
  const TOTAL_DIMS = ASPECTS.reduce((n, a) => n + ASPECT_DIMENSIONS[a].length, 0);
  const filledOf = (auditorId: string): number =>
    data.auditScores.filter((s) => s.auditorId === auditorId && s.score !== null).length;

  return (
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
                    {/* DIMENSION_LABELS 已含「一、」前綴,勿再加 DIMENSION_NUM(原本重複成「一、一、」) */}
                    {DIMENSION_LABELS[dim]}
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
                      <td key={a.id} className="px-3 py-2.5 text-center tabular-nums">{v ?? '—'}</td>
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
            {auditors.map((a) => {
              const t = totalOf(a.id);
              const filled = filledOf(a.id);
              if (t === null) return <td key={a.id} className="px-3 py-2.5 text-center tabular-nums">—</td>;
              // 委員可只評負責構面 → 部分評分屬正常,以中性「(N 構面)」標示其評分範圍,非警示
              return (
                <td key={a.id} className="px-3 py-2.5 text-center tabular-nums">
                  {t}
                  {filled < TOTAL_DIMS && <span className="ml-1 text-caption text-on-surface-variant">({filled} 構面)</span>}
                </td>
              );
            })}
            <td className="px-3 py-2.5 text-center tabular-nums font-semibold">{aggregateTotal ?? '—'}</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

/**
 * 委員「確認填寫完畢/解除鎖定」事件(讀稽核軌跡)。供中心在彙整報告同步看到狀態異動,
 * 不必依賴 email(避免漏看)。以本週期 assignment ids 過濾。
 */
export async function loadAuditorStateChanges(assignmentIds: string[]) {
  if (assignmentIds.length === 0) return [];
  return prisma.auditLog.findMany({
    where: {
      entityType: 'AuditorAssignment',
      entityId: { in: assignmentIds },
      action: { in: ['audit.score.lock', 'audit.score.unlock'] },
    },
    include: { actor: { select: { name: true } } },
    orderBy: { createdAt: 'desc' },
    take: 30,
  });
}

type StateChange = Awaited<ReturnType<typeof loadAuditorStateChanges>>[number];

export function AuditorStateChangeLog({ events }: { events: StateChange[] }) {
  if (events.length === 0) {
    return <p className="text-body-sm text-on-surface-variant">尚無委員「確認填寫完畢 / 解除鎖定」紀錄。</p>;
  }
  return (
    <ul className="space-y-2">
      {events.map((e) => {
        let locked = false;
        try { locked = JSON.parse(e.afterJson ?? '{}').locked === true; } catch { /* 容錯 */ }
        return (
          <li
            key={e.id}
            className={`flex items-start gap-2.5 rounded-md border px-3 py-2 text-body-sm ${
              locked ? 'border-primary-200 bg-primary-50 text-primary-800' : 'border-warning-200 bg-warning-50 text-warning-800'
            }`}
          >
            <span className="mt-0.5 shrink-0">{locked ? <Check size={15} /> : <AlertTriangle size={15} />}</span>
            <div className="min-w-0">
              <span className="font-medium text-on-surface">{e.actor?.name ?? '稽核委員'}</span>
              {locked ? ' 已確認填寫完畢(評分與發現定稿)' : ' 解除鎖定 — 內容可能已異動,請複核'}
              <span className="block text-caption text-on-surface-variant tabular-nums">{fmtROCDateTime(e.createdAt)}</span>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
