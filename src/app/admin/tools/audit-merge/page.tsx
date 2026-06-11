import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { AuditMergeTool } from '@/components/audit-merge/AuditMergeTool';
import '@/components/audit-merge/audit-merge.css';

export const dynamic = 'force-dynamic';

export const metadata = { title: '稽核報告彙整工具 | MOECISH' };

/**
 * 稽核報告彙整工具(SUPER_ADMIN 限定)。
 * 原生模組版:全螢幕三欄工作區(自帶頂欄與返回鍵),不套 AppShell,
 * 以保留工具原有的列印排版與可調式面板。
 */
export default async function AuditMergeToolPage() {
  const session = await auth();
  if (!session) redirect('/login?callbackUrl=/admin/tools/audit-merge');
  if (session.user.role !== 'SUPER_ADMIN') redirect('/dashboard');

  return <AuditMergeTool />;
}
