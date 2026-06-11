import { notFound, redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import PrintTrigger from '../../../print/PrintTrigger';
import { loadAuditReport, ReportBody } from '../ReportBody';

/** 彙整報告列印版(無系統外框;瀏覽器另存 PDF / 直接列印,含委員簽名欄)。 */
export default async function AuditReportPrintPage({ params }: { params: { id: string } }) {
  const session = await auth();
  if (!session) redirect(`/login?callbackUrl=/cycles/${params.id}/audit/report/print`);
  const user = session.user;
  if (user.role === 'ORG_ADMIN') redirect(`/cycles/${params.id}`);

  const data = await loadAuditReport(params.id);
  if (!data) notFound();
  if (
    user.role === 'AUDITOR' &&
    !data.assignments.some((a) => a.auditor.id === user.id)
  ) {
    redirect('/dashboard');
  }

  const auditors = data.assignments.map((a) => a.auditor);

  return (
    <main className="mx-auto max-w-5xl px-8 py-10 bg-white text-neutral-900">
      <PrintTrigger />
      <header className="text-center mb-8">
        <h1 className="text-2xl font-bold">
          教育部所屬國立大學校院附設醫院資通安全稽核作業
        </h1>
        <p className="mt-2 text-xl font-semibold">
          {data.year - 1911} 年度 {data.organization.name} 實地稽核彙整報告
        </p>
      </header>

      <ReportBody data={data} />

      {/* 委員簽名欄 */}
      <section className="mt-12 break-inside-avoid">
        <h2 className="text-title-lg mb-6">委員簽名</h2>
        <div className="grid grid-cols-2 gap-x-12 gap-y-10">
          {(auditors.length > 0 ? auditors : [{ id: 'blank1', name: '' }, { id: 'blank2', name: '' }]).map((a) => (
            <div key={a.id} className="flex items-end gap-3">
              <span className="text-body whitespace-nowrap">{a.name}</span>
              <span className="flex-1 border-b border-neutral-500 h-8" aria-hidden />
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}
