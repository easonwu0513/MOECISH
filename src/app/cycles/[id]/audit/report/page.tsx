import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { AppShell } from '@/components/shell/AppShell';
import { Button } from '@/components/ui/Button';
import { Card, CardTitle, CardDescription } from '@/components/ui/Card';
import { FileText } from '@/components/icons';
import { loadAuditReport, buildReportData, parseReportMeta, ScoreOverview } from './ReportBody';
import AssembledReport from './AssembledReport';
import ConvertButton from './ConvertButton';
import ReportMetaEditor from './ReportMetaEditor';

/**
 * 實地稽核彙整報告:全體委員發現自動整合,版式 = 稽核報告彙整工具的 Word 格式
 * (當天列印給受稽單位簽名的正式文件)。評分總覽僅螢幕顯示(附件17 由各委員自印)。
 */
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

  const report = buildReportData(data);
  const meta = parseReportMeta(data.auditReportMeta);

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
            {data.organization.name} · {data.year - 1911} 年度 · 版式對齊彙整工具 Word 格式,列印版供受稽單位簽名
          </p>
        </div>
        <div className="flex items-center gap-2">
          {user.role === 'SUPER_ADMIN' && (
            <>
              <ReportMetaEditor
                cycleId={data.id}
                initial={{
                  auditDateRaw: report.auditDateRaw,
                  scope: report.scope,
                  auditCriteria: report.auditCriteria.map((c) => c.text),
                  lead: report.lead,
                  subLead: report.subLead,
                  team: meta.team ?? { strategy: [], management: [], technical: [] },
                }}
              />
              <ConvertButton cycleId={data.id} pendingCount={pendingCount} />
            </>
          )}
          <Link href={`/cycles/${data.id}/audit/report/print`} target="_blank" rel="noopener">
            <Button variant="primary" size="sm" leadingIcon={<FileText size={15} />}>
              列印正式報告
            </Button>
          </Link>
        </div>
      </header>

      {/* 評分總覽(螢幕用;附件17 評分表由各委員至「實地稽核」頁自印) */}
      <Card className="mb-6">
        <CardTitle>評分總覽</CardTitle>
        <CardDescription>
          各委員九項評分與平均(僅供管考檢視;附件17 評分表請各委員於「實地稽核」頁列印簽名)
        </CardDescription>
        <div className="mt-4">
          <ScoreOverview data={data} />
        </div>
      </Card>

      {/* 正式報告預覽(Word 版式) */}
      <Card padded={false} className="overflow-hidden">
        <div className="px-6 py-4 border-b border-outline-variant/60 flex items-center justify-between">
          <div>
            <CardTitle>報告預覽</CardTitle>
            <CardDescription>
              全體委員發現即時彙整;封面與基本資訊可由「報告設定」調整
            </CardDescription>
          </div>
        </div>
        <div className="px-8 py-6 bg-white">
          <AssembledReport data={report} />
        </div>
      </Card>
    </AppShell>
  );
}
