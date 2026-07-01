import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { AppShell } from '@/components/shell/AppShell';
import { Button } from '@/components/ui/Button';
import { Card, CardTitle, CardDescription } from '@/components/ui/Card';
import { FileText, Settings, Check, ChevronLeft } from '@/components/icons';
import { loadAuditReport, buildReportData, ScoreOverview, loadAuditorStateChanges, AuditorStateChangeLog } from './ReportBody';
import AssembledReport from './AssembledReport';
import ConvertButton from './ConvertButton';
import FinishButton from './FinishButton';
import ReturnScoreButton from './ReturnScoreButton';

/**
 * 實地稽核彙整報告:全體委員發現自動整合,版式 = 稽核報告彙整工具的 Word 格式
 * (當天列印給受稽單位簽名的正式文件)。評分總覽僅螢幕顯示(附件17 由最高管理員於本頁逐委員列印交付簽名)。
 * 「報告設定」直接啟動彙整工具(週期模式);「已完成年度稽核」一鍵轉缺失+推狀態+通知機關。
 */
export default async function AuditReportPage({ params }: { params: { id: string } }) {
  const session = await auth();
  if (!session) redirect(`/login?callbackUrl=/cycles/${params.id}/audit/report`);
  const user = session.user;
  // 彙整報告為中心(最高管理員)專用的全體委員整合視圖;機關回週期、委員回自己的評分頁。
  if (user.role === 'ORG_ADMIN') redirect(`/cycles/${params.id}`);
  if (user.role === 'AUDITOR') redirect(`/cycles/${params.id}/audit`);

  const data = await loadAuditReport(params.id);
  if (!data) notFound();

  const pendingCount = data.auditFindings.filter(
    (f) => !f.deficiencyId && (f.kind === 'IMPROVE' || f.kind === 'SUGGEST'),
  ).length;

  const report = buildReportData(data);
  const isAdmin = user.role === 'SUPER_ADMIN';
  const status = data.status;
  // 「已完成年度稽核」前置:全體委員評分表須定稿(scoreLockedAt);退件會清 scoreLockedAt,故此即「已繳交且非退件」。
  const unfinalizedAuditors = data.assignments.filter((a) => !a.scoreLockedAt).length;
  const finishBlockReason =
    data.assignments.length === 0
      ? '尚未指派稽核委員'
      : unfinalizedAuditors > 0
        ? `尚有 ${unfinalizedAuditors} 位委員評分表未定稿或已退件`
        : null;
  // 委員定稿/解鎖事件(系統內同步通知中心,避免漏看 email)
  const stateChanges = await loadAuditorStateChanges(data.assignments.map((a) => a.id));

  return (
    <AppShell
      user={{ name: user.name, email: user.email, role: user.role, organizationName: user.organizationName }}
      cycleId={data.id}
      crumbs={[
        { label: '總覽', href: '/dashboard' },
        { label: `${data.year - 1911} 年度 · ${data.organization.name}`, href: `/cycles/${data.id}` },
        { label: '彙整報告' },
      ]}
      watermark
    >
      <header className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <Link
            href={isAdmin ? `/cycles/${data.id}` : `/cycles/${data.id}/audit`}
            className="inline-flex items-center gap-1 min-h-9 -ml-1 mb-1 text-label-lg text-primary-700 hover:underline focus-ring rounded"
          >
            <ChevronLeft size={16} aria-hidden />
            {isAdmin ? '返回週期' : '返回評分與發現'}
          </Link>
          <h1 className="text-headline text-on-surface">實地稽核彙整報告</h1>
          <p className="text-body-sm text-on-surface-variant mt-1">
            {data.organization.name} · {data.year - 1911} 年度 · 版式對齊彙整工具 Word 格式,列印版供受稽單位簽名
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {isAdmin && (
            <Link href={`/admin/tools/audit-merge?cycleId=${data.id}`}>
              <Button variant="tonal" size="sm" leadingIcon={<Settings size={15} />}>
                報告設定(啟動彙整工具)
              </Button>
            </Link>
          )}
          <Link href={`/cycles/${data.id}/audit/report/print`} target="_blank" rel="noopener">
            <Button variant="tonal" size="sm" leadingIcon={<FileText size={15} />}>
              列印正式報告
            </Button>
          </Link>
          {isAdmin && status !== 'CLOSED' && (
            status === 'REMEDIATION'
              ? <ConvertButton cycleId={data.id} pendingCount={pendingCount} />
              : <FinishButton cycleId={data.id} pendingCount={pendingCount} blockReason={finishBlockReason} />
          )}
        </div>
      </header>

      {/* 評分總覽(螢幕用;附件17 評分表由最高管理員於下方逐委員列印交付簽名) */}
      <Card className="mb-6">
        <CardTitle>評分總覽</CardTitle>
        <CardDescription>
          各委員九項評分與平均(僅供管考檢視;附件17 評分表由您於下方逐一列印,交付委員紙本簽名)。
          下表「符合/部分/不符/不適」為機關自評數量供參;各委員實地判定之檢核數量請見各自附件17 評分表。
        </CardDescription>
        {/* 委員填報進度(軟性看板:管理員一眼知誰填完,不上鎖) */}
        {data.assignments.length > 0 && (
          <div className="mt-4 flex flex-wrap gap-2">
            {data.assignments.map((a) => {
              const sc = data.auditScores.filter((s) => s.auditorId === a.auditor.id).length;
              const fc = data.auditFindings.filter((f) => f.auditorId === a.auditor.id).length;
              const locked = !!a.scoreLockedAt; // 委員已按「確認填寫完畢」鎖定 = 已定稿
              return (
                <span
                  key={a.auditor.id}
                  className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-caption tabular-nums ${
                    locked ? 'border-primary-200 bg-primary-50 text-primary-700' : 'border-outline-variant bg-surface-container text-on-surface-variant'
                  }`}
                >
                  <span className="font-medium text-on-surface">{a.auditor.name}</span>
                  已評 {sc} 構面 · 發現 {fc} 條
                  {locked && (
                    <span className="inline-flex items-center gap-1 font-medium text-primary-700">
                      <Check size={13} />已定稿
                    </span>
                  )}
                </span>
              );
            })}
          </div>
        )}
        {/* 最高管理員逐委員:列印附件17 評分表(交付紙本簽名)+ 已定稿者可「退件」供重新編輯;委員端不再自印 */}
        {isAdmin && data.assignments.length > 0 && (
          <div className="mt-4 pt-4 border-t border-outline-variant/40">
            <p className="text-label-sm font-medium text-on-surface-variant mb-2">
              各委員評分表(附件17):列印後交付委員紙本簽名;已定稿者可「退件」解除鎖定供其重新編輯
            </p>
            <div className="flex flex-wrap gap-2">
              {data.assignments.map((a) => (
                <div
                  key={a.auditor.id}
                  className="inline-flex items-center gap-0.5 rounded-md border border-outline-variant/60 bg-surface-container-lowest pl-1 pr-1.5 py-0.5"
                >
                  <Link
                    href={`/cycles/${data.id}/audit/print?auditorId=${a.auditor.id}`}
                    target="_blank"
                    rel="noopener"
                  >
                    <Button variant="text" size="sm" leadingIcon={<FileText size={15} />}>
                      {a.auditor.name} 評分表
                    </Button>
                  </Link>
                  {a.scoreLockedAt && (
                    <ReturnScoreButton cycleId={data.id} auditorId={a.auditor.id} auditorName={a.auditor.name} />
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
        <div className="mt-4">
          <ScoreOverview data={data} />
        </div>
      </Card>

      {/* 委員填寫狀態(每位委員一方塊:目前最新狀態 + 時間;免漏看 email) */}
      <Card className="mb-6">
        <CardTitle>委員填寫狀態</CardTitle>
        <CardDescription>
          各委員目前的填寫狀態與最近動作時間;「已解除鎖定 / 已被退件」代表該委員內容可能已修改,請複核。
        </CardDescription>
        <div className="mt-4">
          <AuditorStateChangeLog assignments={data.assignments} events={stateChanges} />
        </div>
      </Card>

      {/* 正式報告預覽(Word 版式) */}
      <Card padded={false} className="overflow-hidden">
        <div className="px-6 py-4 border-b border-outline-variant/60">
          <CardTitle>報告預覽</CardTitle>
          <CardDescription>
            全體委員發現即時彙整;封面與基本資訊請按「報告設定」於彙整工具中編輯後存回系統
          </CardDescription>
        </div>
        <div className="px-8 py-6 bg-white">
          <AssembledReport data={report} />
        </div>
      </Card>
    </AppShell>
  );
}
