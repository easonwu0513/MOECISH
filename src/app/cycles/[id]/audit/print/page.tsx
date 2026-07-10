import { notFound, redirect } from 'next/navigation';
import { prisma } from '@/lib/db';
import { auth } from '@/lib/auth';
import { DIMENSION_LABELS } from '@/lib/dimension';
import { DEFICIENCY_ASPECT_LABELS, auditorCanScore, type DeficiencyAspect, type Dimension } from '@/lib/types';
import {
  ASPECT_DIMENSIONS, DIMENSION_MAX_SCORE,
  computeDimStats, gradeHint, compareChecklistRef, sortRefsString,
  FINDING_KIND_LABELS, FINDING_KIND_HINTS, type FindingKind, type DimStat,
} from '@/lib/audit-score';
import PrintTrigger from '../../print/PrintTrigger';
import { fmtROC } from '@/lib/date';
import { toFullWidthPunct } from '@/lib/fullwidth-punct';

const ASPECTS: DeficiencyAspect[] = ['STRATEGY', 'MANAGEMENT', 'TECHNICAL'];
const KINDS: FindingKind[] = ['COMPLIANCE', 'IMPROVE', 'SUGGEST'];

/**
 * 附件17「實地稽核評分表」列印:每位委員各自一份(評分+發現+簽名)。
 * 委員:印自己;最高管理員:?auditorId= 印單人,不帶參數 = 全部委員連印(每人換頁)。
 */
export default async function Att17PrintPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams: { auditorId?: string };
}) {
  const session = await auth();
  if (!session) redirect(`/login?callbackUrl=/cycles/${params.id}/audit/print`);
  const user = session.user;
  // 未列舉角色預設拒絕(批30 雷區:新角色落過各 role redirect 即 fail-open 繼承視野)
  if (!['SUPER_ADMIN', 'ORG_ADMIN', 'AUDITOR', 'OBSERVER'].includes(user.role)) redirect('/dashboard');
  if (user.role === 'ORG_ADMIN' || user.role === 'OBSERVER') redirect(`/cycles/${params.id}`);

  const cycle = await prisma.auditCycle.findUnique({
    where: { id: params.id },
    include: {
      organization: true,
      assignments: { include: { auditor: { select: { id: true, name: true } } } },
      checklistVersion: { include: { items: { select: { id: true, dimension: true } } } },
      responses: { select: { checklistItemId: true, compliance: true } },
      auditScores: true,
      auditFindings: { orderBy: [{ aspect: 'asc' }, { createdAt: 'asc' }] },
    },
  });
  if (!cycle) notFound();

  const isAssigned = cycle.assignments.some((a) => a.auditor.id === user.id);
  if (user.role === 'AUDITOR' && !isAssigned) redirect('/dashboard');
  // 委員於「實地稽核」前不可列印評分表(全掃 P2:與評分輸入頁 /audit 的 auditorCanScore 同一分界,
  // 避免 READY 階段可印出全空白附件17=名實不符;維持不加窗口閘的既有裁定不變)
  if (user.role === 'AUDITOR' && !auditorCanScore(cycle.status)) redirect('/dashboard');
  // 註(UAT 批67):實地稽核評分/附件17 屬委員 ONSITE 自身產出與工作台(來源頁 /audit 亦以 auditorCanScore 階段閘把關),
  // 不納入「委員審閱時間區間」(該窗口僅管制資料準備 + 檢核表審閱兩區,對齊使用者裁定範圍),故此處不加窗口閘。

  // 要印哪些委員
  let targets: { id: string; name: string }[];
  if (user.role === 'AUDITOR') {
    targets = [{ id: user.id, name: user.name }];
  } else if (searchParams.auditorId) {
    const a = cycle.assignments.find((x) => x.auditor.id === searchParams.auditorId);
    if (!a) notFound();
    targets = [a.auditor];
  } else {
    targets = cycle.assignments.map((a) => a.auditor);
  }
  if (targets.length === 0) {
    targets = [{ id: '__blank__', name: '' }]; // 尚未指派也可印空白表手填
  }

  const stats = computeDimStats(cycle.checklistVersion.items, cycle.responses);

  return (
    <main className="mx-auto max-w-[210mm] bg-card px-[16mm] py-[12mm] text-black">
      <PrintTrigger />
      <style>{`@media print { .att17-break { page-break-before: always; } }`}</style>
      {targets.map((auditor, idx) => (
        <Att17Sheet
          key={auditor.id}
          first={idx === 0}
          orgName={cycle.organization.name}
          yearROC={cycle.year - 1911}
          onsiteDateROC={cycle.onsiteDate ? fmtROC(cycle.onsiteDate) : null}
          auditorName={auditor.name}
          stats={stats}
          scores={Object.fromEntries(
            cycle.auditScores
              .filter((s) => s.auditorId === auditor.id && s.score !== null)
              .map((s) => [s.dimension, s.score as number]),
          )}
          counts={Object.fromEntries(
            cycle.auditScores
              .filter((s) => s.auditorId === auditor.id)
              .map((s) => [s.dimension, { c1: s.cntComply, c2: s.cntPartial, c3: s.cntNonComply, c4: s.cntNa }]),
          )}
          findings={cycle.auditFindings.filter((f) => f.auditorId === auditor.id)}
        />
      ))}
    </main>
  );
}

const FONT = "'Times New Roman'， '標楷體'， 'KaiU'， 'DFKai-SB'， serif";
const B = '1px solid #000';

type SheetCounts = { c1: number | null; c2: number | null; c3: number | null; c4: number | null };
function Att17Sheet({
  first, orgName, yearROC, onsiteDateROC, auditorName, stats, counts, scores, findings,
}: {
  first: boolean;
  orgName: string;
  yearROC: number;
  onsiteDateROC: string | null;
  auditorName: string;
  stats: Record<string, DimStat>;
  /** 委員手填之檢核結果數量(符/部/不符/不適);空白即留白 */
  counts: Record<string, SheetCounts>;
  scores: Record<string, number>;
  findings: { id: string; aspect: string; kind: string; content: string; checklistRef: string | null }[];
}) {
  const scored = Object.keys(scores).length > 0;
  const total = Object.values(scores).reduce((a, b) => a + b, 0);

  const th: React.CSSProperties = {
    border: B, padding: '2.5pt 6pt', fontWeight: 'bold', textAlign: 'center',
    fontSize: '11pt', verticalAlign: 'middle',
  };
  const td: React.CSSProperties = {
    border: B, padding: '2.5pt 6pt', fontSize: '11pt', verticalAlign: 'middle',
  };

  return (
    <div className={first ? undefined : 'att17-break'} style={{ fontFamily: FONT, color: '#000', lineHeight: 1.5, paddingTop: first ? 0 : '8pt' }}>
      <div style={{ textAlign: 'center', fontSize: '14pt', fontWeight: 'bold' }}>
        教育部所屬國立大學校院附設醫院資通安全稽核作業
      </div>
      <div style={{ textAlign: 'center', fontSize: '16pt', fontWeight: 'bold', margin: '4pt 0 10pt' }}>
        實地稽核評分表
      </div>
      <div style={{ fontSize: '12pt', marginBottom: '8pt' }}>
        受稽機關：{orgName}　　年度：{yearROC} 年度
      </div>

      {/* 稽核評分(整表不跨頁:break-inside avoid + 緊縮列高,塞於同一頁) */}
      <div style={{ fontSize: '13pt', fontWeight: 'bold', margin: '6pt 0 4pt' }}>稽核評分</div>
      <table style={{ width: '100%', borderCollapse: 'collapse', breakInside: 'avoid', pageBreakInside: 'avoid' }}>
        <thead>
          <tr>
            <th style={{ ...th, width: '9%' }} rowSpan={2}>稽核構面</th>
            <th style={th} rowSpan={2}>稽核項目</th>
            <th style={{ ...th, width: '9%' }} rowSpan={2}>檢核項目數量</th>
            <th style={th} colSpan={4}>檢核結果數量統計</th>
            <th style={{ ...th, width: '9%' }} rowSpan={2}>評分</th>
          </tr>
          <tr>
            <th style={{ ...th, width: '8%' }}>符合</th>
            <th style={{ ...th, width: '8%' }}>部分符合</th>
            <th style={{ ...th, width: '8%' }}>不符合</th>
            <th style={{ ...th, width: '8%' }}>不適用</th>
          </tr>
        </thead>
        <tbody>
          {ASPECTS.flatMap((aspect) =>
            ASPECT_DIMENSIONS[aspect].map((dim: Dimension, i: number) => {
              const st = stats[dim] ?? { total: 0, c1: 0, c2: 0, c3: 0, c4: 0 };
              const ct = counts[dim] ?? { c1: null, c2: null, c3: null, c4: null };
              const v = scores[dim];
              return (
                <tr key={dim}>
                  {i === 0 && (
                    <td style={{ ...td, textAlign: 'center', fontWeight: 'bold' }} rowSpan={3}>
                      {DEFICIENCY_ASPECT_LABELS[aspect]}
                    </td>
                  )}
                  <td style={td}>
                    {/* DIMENSION_LABELS 已含「一、」前綴 */}
                    {DIMENSION_LABELS[dim]}({DIMENSION_MAX_SCORE[dim]}分）：
                    <div style={{ fontSize: '8.5pt', lineHeight: 1.2 }}>{gradeHint(dim)}</div>
                  </td>
                  <td style={{ ...td, textAlign: 'center' }}>{st.total}</td>
                  <td style={{ ...td, textAlign: 'center' }}>{ct.c1 ?? ''}</td>
                  <td style={{ ...td, textAlign: 'center' }}>{ct.c2 ?? ''}</td>
                  <td style={{ ...td, textAlign: 'center' }}>{ct.c3 ?? ''}</td>
                  <td style={{ ...td, textAlign: 'center' }}>{ct.c4 ?? ''}</td>
                  <td style={{ ...td, textAlign: 'center', fontSize: '12pt' }}>
                    {v ?? ''}
                  </td>
                </tr>
              );
            }),
          )}
          <tr>
            <td style={{ ...td, textAlign: 'right', fontWeight: 'bold' }} colSpan={7}>
              得　　分（滿分100分）
            </td>
            <td style={{ ...td, textAlign: 'center', fontWeight: 'bold', fontSize: '12pt' }}>
              {scored ? total : ''}
            </td>
          </tr>
        </tbody>
      </table>

      {/* 稽核發現(強制換頁:讓稽核評分獨占第一頁) */}
      <div style={{ fontSize: '13pt', fontWeight: 'bold', margin: '10pt 0 4pt', breakBefore: 'page', pageBreakBefore: 'always' }}>稽核發現</div>
      {/* 轉置版:類別標題移到左欄(每類一列、整列全寬),較三欄並排好讀 */}
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <tbody>
          {KINDS.map((kind) => {
            const list = findings
              .filter((f) => f.kind === kind)
              .sort((a, b) => compareChecklistRef(a.checklistRef, b.checklistRef));
            return (
              <tr key={kind}>
                <th style={{ ...th, width: '20%', textAlign: 'left', verticalAlign: 'top' }}>
                  {FINDING_KIND_LABELS[kind]}
                  <div style={{ fontSize: '8.5pt', fontWeight: 'normal', lineHeight: 1.2 }}>※{FINDING_KIND_HINTS[kind]}</div>
                </th>
                <td style={{ ...td, verticalAlign: 'top', height: '60pt' }}>
                  {list.length === 0 ? '' : (
                    <ol style={{ margin: 0, paddingLeft: '14pt', fontSize: '10.5pt', lineHeight: 1.6 }}>
                      {list.map((f) => (
                        <li key={f.id} style={{ marginBottom: '4pt' }}>
                          {f.checklistRef ? `【${sortRefsString(f.checklistRef)}】` : ''}{toFullWidthPunct(f.content)}
                        </li>
                      ))}
                    </ol>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      <div style={{ fontSize: '12pt', marginTop: '18pt', lineHeight: 2 }}>
        <div>稽核日期：{onsiteDateROC ?? '中華民國　　　年　　月　　日'}</div>
        <div>受稽機關：{orgName}</div>
        {/* 服務機關／職稱欄移除:部分委員不願公布(依使用者回饋) */}
        <div style={{ marginTop: '14pt' }}>
          <span>委員簽名：{auditorName ? `${auditorName}　` : ''}________________</span>
        </div>
      </div>
    </div>
  );
}
