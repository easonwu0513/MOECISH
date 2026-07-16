import { notFound, redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { AuditMergeTool } from '@/components/audit-merge/AuditMergeTool';
import { loadAuditReport, buildReportData } from '@/app/cycles/[id]/audit/report/ReportBody';
import '@/components/audit-merge/audit-merge.css';

export const dynamic = 'force-dynamic';

export const metadata = { title: '稽核報告彙整工具 | MOECISH' };

/**
 * 稽核報告彙整工具(SUPER_ADMIN 限定)。
 * 原生模組版:全螢幕三欄工作區(自帶頂欄與返回鍵),不套 AppShell,
 * 以保留工具原有的列印排版與可調式面板。
 * 帶 ?cycleId= 進入「週期模式」:該週期全體委員發現自動帶入,
 * 頁首(封面/基本資訊)編輯可存回系統。
 */
export default async function AuditMergeToolPage({
  searchParams,
}: {
  searchParams: { cycleId?: string };
}) {
  const session = await auth();
  if (!session) redirect('/login?callbackUrl=/admin/tools/audit-merge');
  if (session.user.role !== 'SUPER_ADMIN') redirect('/dashboard');

  if (searchParams.cycleId) {
    const data = await loadAuditReport(searchParams.cycleId);
    // 帶了 cycleId 卻查不到(已刪/ID 有誤)→ notFound,避免靜默開空白手動工具讓使用者誤以為沒資料(批35 稽核)
    if (!data) notFound();
    return <AuditMergeTool cycleId={data.id} initial={buildReportData(data)} />;
  }

  return <AuditMergeTool />;
}
