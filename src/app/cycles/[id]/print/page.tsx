import { notFound, redirect } from 'next/navigation';
import { prisma } from '@/lib/db';
import { auth } from '@/lib/auth';
import {
  COMPLIANCE_LABELS,
  FINDING_ASPECT_LABELS,
  FINDING_TYPE_LABELS,
  type ComplianceLevel,
  type FindingAspect,
  type FindingType,
  type Dimension,
} from '@/lib/types';
import { DIMENSION_LABELS, DIMENSION_ORDER } from '@/lib/dimension';
import { CYCLE_STATUS_LABELS } from '@/lib/state-machine';
import type { CycleStatus } from '@/lib/types';
import PrintTrigger from './PrintTrigger';

export default async function PrintPage({ params }: { params: { id: string } }) {
  const session = await auth();
  if (!session) redirect(`/login?callbackUrl=/cycles/${params.id}/print`);

  const cycle = await prisma.auditCycle.findUnique({
    where: { id: params.id },
    include: {
      organization: true,
      checklistVersion: { include: { items: { orderBy: { orderIndex: 'asc' } } } },
      responses: { include: { comments: { orderBy: { createdAt: 'asc' } } } },
      findings: {
        include: { remediation: { include: { decisions: { orderBy: { round: 'asc' } } } } },
        orderBy: [{ findingNo: 'asc' }],
      },
      signatures: { orderBy: { signedAt: 'desc' } },
    },
  });
  if (!cycle) notFound();

  if (
    (session.user.role === 'RESPONDENT' || session.user.role === 'SUPERVISOR') &&
    cycle.organizationId !== session.user.organizationId
  ) {
    redirect('/');
  }

  const responsesByItem = new Map(cycle.responses.map((r) => [r.checklistItemId, r]));
  const respSig = cycle.signatures.find((s) => s.signerRole === 'RESPONDENT');
  const supSig = cycle.signatures.find((s) => s.signerRole === 'SUPERVISOR');

  return (
    <>
      <PrintTrigger />
      <div className="mx-auto max-w-[210mm] bg-white text-slate-900 p-10 print:p-0 print:max-w-none">
        <style>{`
          @media print {
            @page { size: A4; margin: 18mm; }
            body { background: white !important; }
            .no-print { display: none !important; }
            h2 { page-break-after: avoid; }
            table { page-break-inside: avoid; }
            section { page-break-inside: avoid; }
          }
        `}</style>

        <div className="no-print mb-6 flex justify-between items-center">
          <a href={`/cycles/${cycle.id}`} className="text-sm text-slate-500 hover:text-brand-600">← 返回</a>
          <button onClick={undefined} className="opacity-0 pointer-events-none"></button>
        </div>

        <header className="text-center mb-6">
          <h1 className="text-2xl font-bold">{cycle.organization.name}</h1>
          <p className="text-lg mt-1">{cycle.year - 1911} 年度資通安全稽核綜合報告</p>
          <p className="text-sm text-slate-500 mt-1">
            狀態：{CYCLE_STATUS_LABELS[cycle.status as CycleStatus]}　·　產生日期：{new Date().toLocaleDateString('zh-TW')}
          </p>
        </header>

        <section className="mb-8">
          <h2 className="text-lg font-bold border-b-2 border-brand-500 pb-1 mb-3">壹、稽核基本資料</h2>
          <table className="w-full text-sm border">
            <tbody>
              <tr><th className="bg-slate-50 text-left w-32 p-2 border">受稽機關</th><td className="p-2 border">{cycle.organization.name}</td></tr>
              <tr><th className="bg-slate-50 text-left p-2 border">機關代碼</th><td className="p-2 border">{cycle.organization.code}</td></tr>
              <tr><th className="bg-slate-50 text-left p-2 border">稽核年度</th><td className="p-2 border">{cycle.year - 1911} 年度</td></tr>
              <tr><th className="bg-slate-50 text-left p-2 border">起訖日期</th><td className="p-2 border">{new Date(cycle.startDate).toLocaleDateString('zh-TW')} ~ {new Date(cycle.dueDate).toLocaleDateString('zh-TW')}</td></tr>
            </tbody>
          </table>
        </section>

        <section className="mb-8">
          <h2 className="text-lg font-bold border-b-2 border-brand-500 pb-1 mb-3">貳、檢核表填答結果</h2>
          {DIMENSION_ORDER.map((dim) => {
            const items = cycle.checklistVersion.items.filter((i) => i.dimension === dim);
            return (
              <div key={dim} className="mb-4">
                <h3 className="text-sm font-semibold mt-3 mb-1">{DIMENSION_LABELS[dim as Dimension]}</h3>
                <table className="w-full text-[11px] border-collapse">
                  <thead>
                    <tr className="bg-slate-100">
                      <th className="border p-1 w-12">編號</th>
                      <th className="border p-1">檢核項目</th>
                      <th className="border p-1 w-16">符合情形</th>
                      <th className="border p-1">說明</th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((item) => {
                      const r = responsesByItem.get(item.id);
                      return (
                        <tr key={item.id}>
                          <td className="border p-1 font-mono align-top">{item.itemNo}</td>
                          <td className="border p-1 align-top">{item.content}</td>
                          <td className="border p-1 text-center align-top">
                            {r?.compliance ? COMPLIANCE_LABELS[r.compliance as ComplianceLevel] : '—'}
                          </td>
                          <td className="border p-1 align-top whitespace-pre-wrap">{r?.description ?? ''}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            );
          })}
        </section>

        {cycle.findings.length > 0 && (
          <section className="mb-8">
            <h2 className="text-lg font-bold border-b-2 border-brand-500 pb-1 mb-3">參、稽核發現與改善情形</h2>
            {cycle.findings.map((f) => {
              const r = f.remediation;
              let tags: string[] = [];
              try { tags = r?.actionTagsJson ? JSON.parse(r.actionTagsJson) : []; } catch {}
              return (
                <div key={f.id} className="mb-5 text-sm">
                  <p className="font-semibold">
                    【{f.findingNo}】{FINDING_ASPECT_LABELS[f.aspect as FindingAspect]} — {FINDING_TYPE_LABELS[f.type as FindingType]} — {f.title}
                  </p>
                  <p className="text-xs text-slate-500 mb-1">構面：{DIMENSION_LABELS[f.dimension as Dimension]}</p>
                  <p className="whitespace-pre-wrap text-sm">{f.description}</p>
                  {r && (
                    <table className="w-full text-xs border mt-2">
                      <tbody>
                        <tr><th className="bg-slate-50 w-32 p-2 border text-left align-top">發生原因（根因分析）</th><td className="p-2 border whitespace-pre-wrap">{r.rootCause ?? ''}</td></tr>
                        <tr><th className="bg-slate-50 p-2 border text-left align-top">改善措施</th><td className="p-2 border whitespace-pre-wrap">
                          {tags.length ? <div className="mb-1 text-brand-700">標記：{tags.join('、')}</div> : null}
                          {r.actions ?? ''}
                        </td></tr>
                        <tr><th className="bg-slate-50 p-2 border text-left align-top">預計完成時程</th><td className="p-2 border">{r.plannedDueDate ? new Date(r.plannedDueDate).toLocaleDateString('zh-TW') : ''}</td></tr>
                        <tr><th className="bg-slate-50 p-2 border text-left align-top">進度追蹤方式</th><td className="p-2 border whitespace-pre-wrap">{r.trackingMethod ?? ''}</td></tr>
                        <tr><th className="bg-slate-50 p-2 border text-left align-top">執行情形</th><td className="p-2 border whitespace-pre-wrap">{r.executionStatus ?? ''}</td></tr>
                      </tbody>
                    </table>
                  )}
                  {r && r.decisions.length > 0 && (
                    <div className="mt-2 text-xs">
                      <p className="font-semibold">審核紀錄：</p>
                      <ul className="ml-4 list-disc">
                        {r.decisions.map((d) => (
                          <li key={d.id}>
                            第 {d.round} 輪 · {d.decision === 'APPROVED' ? '審核通過' : '持續改正'} · {new Date(d.decidedAt).toLocaleString('zh-TW')}
                            {d.comment ? `　${d.comment}` : ''}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              );
            })}
          </section>
        )}

        <section className="mt-10 pt-4">
          <h2 className="text-lg font-bold border-b-2 border-brand-500 pb-1 mb-3">肆、簽章</h2>
          <table className="w-full text-sm border">
            <tbody>
              <tr>
                <th className="bg-slate-50 w-28 p-3 border text-left">單位名稱</th>
                <td className="p-3 border">{cycle.organization.name}</td>
                <th className="bg-slate-50 w-28 p-3 border text-left">填報時間</th>
                <td className="p-3 border">{new Date().toLocaleDateString('zh-TW')}</td>
              </tr>
              <tr>
                <th className="bg-slate-50 p-3 border text-left">填報人簽章</th>
                <td className="p-3 border h-24 align-top">
                  {respSig ? (
                    <div>
                      <img
                        src={`/api/signatures/${respSig.id}/image`}
                        alt="簽章"
                        style={{ maxHeight: '60px', maxWidth: '100%' }}
                      />
                      <div className="text-xs text-slate-500 mt-1">
                        {respSig.signerName} · {new Date(respSig.signedAt).toLocaleString('zh-TW')}
                      </div>
                    </div>
                  ) : '　'}
                </td>
                <th className="bg-slate-50 p-3 border text-left">單位主管簽章</th>
                <td className="p-3 border h-24 align-top">
                  {supSig ? (
                    <div>
                      <img
                        src={`/api/signatures/${supSig.id}/image`}
                        alt="簽章"
                        style={{ maxHeight: '60px', maxWidth: '100%' }}
                      />
                      <div className="text-xs text-slate-500 mt-1">
                        {supSig.signerName} · {new Date(supSig.signedAt).toLocaleString('zh-TW')}
                      </div>
                    </div>
                  ) : '　'}
                </td>
              </tr>
            </tbody>
          </table>
        </section>
      </div>
    </>
  );
}
