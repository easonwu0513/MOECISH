import { notFound, redirect } from 'next/navigation';
import { prisma } from '@/lib/db';
import { auth } from '@/lib/auth';
import {
  DEFICIENCY_ASPECT_LABELS,
  DEFICIENCY_TYPE_LABELS,
  EXEC_STATUS_LABELS,
  auditorCanSeeCycle,
  type DeficiencyAspect,
  type DeficiencyType,
  type ExecStatus,
} from '@/lib/types';
import PrintTrigger from './PrintTrigger';

const ASPECT_NUM: Record<DeficiencyAspect, string> = {
  STRATEGY: '一', MANAGEMENT: '二', TECHNICAL: '三',
};

function rocDate(d: Date | null): string {
  if (!d) return '';
  const dt = new Date(d);
  return `${dt.getFullYear() - 1911} 年 ${dt.getMonth() + 1} 月 ${dt.getDate()} 日`;
}

export default async function PrintPage({ params }: { params: { id: string } }) {
  const session = await auth();
  if (!session) redirect(`/login?callbackUrl=/cycles/${params.id}/print`);

  const cycle = await prisma.auditCycle.findUnique({
    where: { id: params.id },
    include: {
      organization: true,
      assignments: true,
      deficiencies: {
        include: { action: true },
        orderBy: [{ aspect: 'asc' }, { type: 'asc' }, { itemNo: 'asc' }],
      },
    },
  });
  if (!cycle) notFound();

  const user = session.user;
  if (user.role === 'ORG_ADMIN' && cycle.organizationId !== user.organizationId) redirect('/dashboard');
  // 委員:未指派或週期仍開立中(DRAFT) → 導回(對齊 access-policy 'cycle.access';補上列印頁漏網閘)
  if (user.role === 'AUDITOR' && (!cycle.assignments.some((a) => a.auditorId === user.id) || !auditorCanSeeCycle(cycle.status))) redirect('/dashboard');

  const aspects: DeficiencyAspect[] = ['STRATEGY', 'MANAGEMENT', 'TECHNICAL'];

  return (
    <>
      <PrintTrigger />
      <div className="print-report mx-auto max-w-[210mm] bg-white text-slate-900 p-10 print:p-0 print:max-w-none">
        <style>{`
          /* 公文字體:與彙整工具報告同一套(標楷體 + Times New Roman),
             同一份正式報告不能一邊標楷一邊黑體 */
          .print-report {
            font-family: 'Times New Roman', '標楷體', 'BiauKai', 'DFKai-SB', serif;
          }
          @media print {
            @page { size: A4; margin: 2.54cm; }
            body { background: white !important; }
            .no-print { display: none !important; }
            h2 { page-break-after: avoid; }
            .def-block { page-break-inside: avoid; }
          }
        `}</style>

        <div className="no-print mb-6">
          <a href={`/cycles/${cycle.id}`} className="text-sm text-slate-500 hover:text-primary-600">← 返回</a>
        </div>

        <header className="mb-6">
          <h1 className="text-xl font-bold text-center mb-4">
            {cycle.year - 1911} 年度{cycle.organization.name}
            <br />
            資通安全稽核改善暨執行情形報告
          </h1>
          <div className="text-sm space-y-0.5">
            <p>受稽機關：{cycle.organization.name}</p>
            <p>受稽日期：{rocDate(cycle.onsiteDate ?? cycle.startDate)}</p>
            <p>文件填寫日期：{rocDate(new Date())}</p>
          </div>
        </header>

        {aspects.map((aspect) => {
          const inAspect = cycle.deficiencies.filter((d) => d.aspect === aspect);
          if (inAspect.length === 0) return null;
          const types: DeficiencyType[] = ['IMPROVE', 'SUGGEST'];
          return (
            <section key={aspect} className="mb-8">
              <h2 className="text-base font-bold border-b-2 border-slate-700 pb-1 mb-3">
                {ASPECT_NUM[aspect]}、實地稽核－{DEFICIENCY_ASPECT_LABELS[aspect]}
              </h2>
              {types.map((type) => {
                const items = inAspect.filter((d) => d.type === type);
                if (items.length === 0) return null;
                return (
                  <div key={type} className="mb-4">
                    <h3 className="text-sm font-semibold mb-2">{DEFICIENCY_TYPE_LABELS[type]}</h3>
                    {items.map((d) => {
                      const a = d.action;
                      const measures: string[] = [];
                      if (a?.measureStrategy) measures.push(`■ 策略面調整：${a.measureStrategy}`);
                      if (a?.measureManagement) measures.push(`■ 管理面調整：${a.measureManagement}`);
                      if (a?.measureTechnical) measures.push(`■ 技術面調整：${a.measureTechnical}`);
                      const exec = a?.execStatus as ExecStatus | null;
                      let execLine = exec ? `■ ${EXEC_STATUS_LABELS[exec]}` : '';
                      if (exec === 'ON_TIME_DONE' || exec === 'LATE_DONE') {
                        execLine += `（實際完成日期 ${rocDate(a?.actualDate ?? null)}）`;
                      }
                      if (exec === 'LATE_IN_PROGRESS') {
                        execLine += `（預計完成日期延長至 ${rocDate(a?.extendedDate ?? null)}）`;
                      }
                      if ((exec === 'LATE_DONE' || exec === 'LATE_IN_PROGRESS') && a?.delayReason) {
                        execLine += `，原因：${a.delayReason}`;
                      }
                      return (
                        <table key={d.id} className="def-block w-full text-xs border-collapse mb-3">
                          <tbody>
                            <tr>
                              <th className="bg-slate-100 border border-slate-400 p-2 w-12 align-top">項次</th>
                              <td className="border border-slate-400 p-2 w-8 text-center align-top font-mono">{d.itemNo}</td>
                              <th className="bg-slate-100 border border-slate-400 p-2 w-24 align-top">
                                {DEFICIENCY_TYPE_LABELS[type]}
                              </th>
                              <td className="border border-slate-400 p-2 align-top whitespace-pre-wrap">
                                {d.description}
                              </td>
                            </tr>
                            <tr>
                              <th className="bg-slate-100 border border-slate-400 p-2 align-top" colSpan={2}>
                                發生原因<br />（根因分析）
                              </th>
                              <td className="border border-slate-400 p-2 align-top whitespace-pre-wrap" colSpan={2}>
                                {a?.rootCause ?? ''}
                              </td>
                            </tr>
                            <tr>
                              <th className="bg-slate-100 border border-slate-400 p-2 align-top" colSpan={2}>
                                改善措施<br />（可複選）
                              </th>
                              <td className="border border-slate-400 p-2 align-top whitespace-pre-wrap" colSpan={2}>
                                {measures.length ? measures.join('\n') : ''}
                              </td>
                            </tr>
                            <tr>
                              <th className="bg-slate-100 border border-slate-400 p-2 align-top" colSpan={2}>
                                預計完成時程及<br />進度追蹤方式
                              </th>
                              <td className="border border-slate-400 p-2 align-top whitespace-pre-wrap" colSpan={2}>
                                {a?.plannedDate ? `預計完成時程：${rocDate(a.plannedDate)}\n` : ''}
                                {a?.trackingMethod ? `進度追蹤方式：${a.trackingMethod}` : ''}
                              </td>
                            </tr>
                            <tr>
                              <th className="bg-slate-100 border border-slate-400 p-2 align-top" colSpan={2}>執行情形</th>
                              <td className="border border-slate-400 p-2 align-top whitespace-pre-wrap" colSpan={2}>
                                {execLine}
                              </td>
                            </tr>
                          </tbody>
                        </table>
                      );
                    })}
                  </div>
                );
              })}
            </section>
          );
        })}

        <section className="mt-12 pt-6">
          <table className="w-full text-sm">
            <tbody>
              <tr>
                <td className="w-1/2 p-4">
                  <p className="mb-16">承辦人：</p>
                </td>
                <td className="w-1/2 p-4">
                  <p className="mb-16">單位主管：</p>
                </td>
              </tr>
            </tbody>
          </table>
        </section>
      </div>
    </>
  );
}
