import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { AppShell } from '@/components/shell/AppShell';
import { Button } from '@/components/ui/Button';
import { FileText } from '@/components/icons';
import { loadAuditReport, ReportBody } from './ReportBody';
import ConvertButton from './ConvertButton';

/** 實地稽核彙整報告:全體委員評分與發現自動整合(最高管理員/受指派委員)。 */
export default async function AuditReportPage({ params }: { params: { id: string } }) {
  const session = await auth();
  if (!session) redirect(`/login?callbackUrl=/cycles/${params.id}/audit/report`);
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

  const pendingCount = data.auditFindings.filter(
    (f) => !f.deficiencyId && (f.kind === 'IMPROVE' || f.kind === 'SUGGEST'),
  ).length;

  return (
    <AppShell
      user={{ name: user.name, email: user.email, role: user.role, organizationName: user.organizationName }}
      cycleId={data.id}
      crumbs={[
        { label: '總覽', href: '/dashboard' },
        { label: `${data.year - 1911} 年度`, href: `/cycles/${data.id}` },
        { label: '彙整報告' },
      ]}
    >
      <header className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-headline text-neutral-900">實地稽核彙整報告</h1>
          <p className="text-body-sm text-neutral-500 mt-1">
            {data.organization.name} · {data.year - 1911} 年度 · 全體委員評分與發現即時整合
          </p>
        </div>
        <div className="flex items-center gap-2">
          {user.role === 'SUPER_ADMIN' && (
            <ConvertButton cycleId={data.id} pendingCount={pendingCount} />
          )}
          <Link href={`/cycles/${data.id}/audit/report/print`} target="_blank" rel="noopener">
            <Button variant="tonal" size="sm" leadingIcon={<FileText size={15} />}>
              列印版
            </Button>
          </Link>
        </div>
      </header>

      <ReportBody data={data} />
    </AppShell>
  );
}
