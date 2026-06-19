import { notFound, redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import PrintTrigger from '../../../print/PrintTrigger';
import { loadAuditReport, buildReportData } from '../ReportBody';
import AssembledReport from '../AssembledReport';

/**
 * 實地稽核報告列印版:版式 = 稽核報告彙整工具的 Word 格式
 * (封面/壹基本資訊/貳稽核發現/參後續辦理+簽名表),當天印出給受稽單位簽名。
 */
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

  const report = buildReportData(data);

  return (
    <main className="mx-auto max-w-[210mm] bg-white px-[20mm] py-[15mm] text-black">
      <PrintTrigger />
      <AssembledReport data={report} />
    </main>
  );
}
