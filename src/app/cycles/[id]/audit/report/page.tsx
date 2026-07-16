import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { AppShell } from '@/components/shell/AppShell';
import { Button } from '@/components/ui/Button';
import { Card, CardTitle, CardDescription } from '@/components/ui/Card';
import { FileText, Settings, Check, ChevronLeft } from '@/components/icons';
import { loadAuditReport, buildReportData, ScoreOverview, loadAuditorStateChanges, AuditorStateChangeLog } from './ReportBody';
import { auditorScoringComplete } from '@/lib/audit-score';
import { canAssignAuditors } from '@/lib/stage';
import type { CycleStatus } from '@/lib/types';
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
  // 未列舉角色預設拒絕(批30 雷區:新角色落過各 role redirect 即 fail-open 繼承視野)
  if (!['SUPER_ADMIN', 'ORG_ADMIN', 'AUDITOR', 'OBSERVER'].includes(user.role)) redirect('/dashboard');
  // 彙整報告為中心(最高管理員)專用的全體委員整合視圖;機關回週期、委員回自己的評分頁。
  if (user.role === 'ORG_ADMIN') redirect(`/cycles/${params.id}`);
  if (user.role === 'AUDITOR') redirect(`/cycles/${params.id}/audit`);
  // 觀察員(批30):彙整報告中心專用(auditReport.view);觀察員導回練習工作台
  if (user.role === 'OBSERVER') redirect(`/cycles/${params.id}/practice`);

  const data = await loadAuditReport(params.id);
  if (!data) notFound();

  // 待轉缺失發現數:只計「現存指派委員」的發現(排除已移除委員留下的孤兒發現,對齊彙整報告過濾)。
  const activeAuditorIds = new Set(data.assignments.map((a) => a.auditor.id));
  const pendingCount = data.auditFindings.filter(
    (f) => !f.deficiencyId && (f.kind === 'IMPROVE' || f.kind === 'SUGGEST') && activeAuditorIds.has(f.auditorId),
  ).length;

  const report = buildReportData(data);
  const isAdmin = user.role === 'SUPER_ADMIN';
  const status = data.status;
  // 「已完成年度稽核」前置(與後端 auditorsFinalized 同語彙,避免前端顯示可完成、按了才吃 400):
  //  ① 全體委員評分表須定稿(scoreLockedAt;退件會清空,故此即「已繳交且非退件」)。
  //  ② 定稿者須依責任構面「真的評了分」(擋 0 構面定稿的舊資料)。
  const unfinalizedAuditors = data.assignments.filter((a) => !a.scoreLockedAt).length;
  // ③ 帶入發現仍含「(請補述…)」佔位語者不可完成(後端 convert 亦硬擋;此為前端同語彙預警,批36)
  const placeholderFindings = data.auditFindings.filter(
    (f) => !f.deficiencyId && (f.kind === 'IMPROVE' || f.kind === 'SUGGEST') && /[(（]請補述/.test(f.content),
  ).length;
  const totalByDim = new Map<string, number>();
  for (const it of data.checklistVersion.items) totalByDim.set(it.dimension, (totalByDim.get(it.dimension) ?? 0) + 1);
  // 與後端 auditorsFinalized 同語彙:定稿委員須「至少一個構面完整評分」(不逐責任構面硬擋——委員分工,
  // 每人實填構面不同、不必填滿其負責構面全部);只擋「已定稿卻一個構面都沒完整評」的舊 0 構面定稿。
  const incompleteFinalized = data.assignments.find(
    (a) =>
      a.scoreLockedAt &&
      !auditorScoringComplete([], data.auditScores.filter((s) => s.auditorId === a.auditor.id), totalByDim),
  );
  const finishBlockReason =
    data.assignments.length === 0
      ? '尚未指派稽核委員'
      : unfinalizedAuditors > 0
        ? `尚有 ${unfinalizedAuditors} 位委員評分表未定稿或已退件`
        : incompleteFinalized
          ? `委員「${incompleteFinalized.auditor.name}」已定稿但尚未完成任何構面評分，請對其退件補齊`
          : placeholderFindings > 0
            ? `${placeholderFindings} 條帶入的發現仍為「請補述…」佔位文字，請洽該委員補述（或退件），避免佔位語成為正式缺失`
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
          <h1 className="text-headline text-ink-900">實地稽核彙整報告</h1>
          <p className="text-body-sm text-ink-500 mt-1">
            {data.organization.name} · {data.year - 1911} 年度 · 版式對齊彙整工具 Word 格式，列印版供受稽單位簽名
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {isAdmin && (
            <Link href={`/admin/tools/audit-merge?cycleId=${data.id}`}>
              <Button variant="tonal" size="sm" leadingIcon={<Settings size={15} />}>
                報告設定（啟動彙整工具）
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
              // 「完成年度稽核」僅在 ONSITE/REPORT_ISSUED 顯示(全掃 P2):更早階段委員尚不能評分,
              // auditorsFinalized 必為 false→按了吃 400,可見卻必失敗的體驗瑕疵;收斂到唯一合理起點。
              : (status === 'ONSITE' || status === 'REPORT_ISSUED')
                ? <FinishButton cycleId={data.id} pendingCount={pendingCount} blockReason={finishBlockReason} dueDateSet={data.dueDate != null} />
                : null
          )}
        </div>
      </header>

      {/* 評分總覽(螢幕用;附件17 評分表由最高管理員於下方逐委員列印交付簽名) */}
      <Card className="mb-6">
        <CardTitle>評分總覽</CardTitle>
        <CardDescription>
          各委員九項評分與平均（僅供管考檢視；附件17 評分表由您於下方逐一列印，交付委員紙本簽名）。
          下表「符合/部分/不符/不適」為機關自評數量供參；各委員實地判定之檢核數量請見各自附件17 評分表。
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
                    locked ? 'border-primary-200 bg-primary-50 text-primary-700' : 'border-rule bg-paper-sunk text-ink-500'
                  }`}
                >
                  <span className="font-medium text-ink-900">{a.auditor.name}</span>
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
          <div className="mt-4 pt-4 border-t border-rule">
            <p className="text-label-sm font-medium text-ink-500 mb-2">
              各委員評分表（附件17）：列印後交付委員紙本簽名。{canAssignAuditors(status as CycleStatus) ? '已定稿者可「退件」解除鎖定供其重新編輯。' : '實地稽核階段已結束，評分已凍結，不可再退件。'}
            </p>
            <div className="flex flex-wrap gap-2">
              {data.assignments.map((a) => (
                <div
                  key={a.auditor.id}
                  className="inline-flex items-center gap-0.5 rounded-md border border-rule bg-card pl-1 pr-1.5 py-0.5"
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
                  {/* 退件僅在委員名單未凍結時可用(批34 圖7:REPORT_ISSUED 起評分已定稿凍結,前端隱藏+後端 409 雙層) */}
                  {a.scoreLockedAt && canAssignAuditors(status as CycleStatus) && (
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
          各委員目前的填寫狀態與最近動作時間；「已解除鎖定 / 已被退件」代表該委員內容可能已修改，請複核。
        </CardDescription>
        <div className="mt-4">
          <AuditorStateChangeLog assignments={data.assignments} events={stateChanges} />
        </div>
      </Card>

      {/* 正式報告預覽(Word 版式) */}
      <Card padded={false} className="overflow-hidden">
        <div className="px-6 py-4 border-b border-rule">
          <CardTitle>報告預覽</CardTitle>
          <CardDescription>
            全體委員發現即時彙整；封面與基本資訊請按「報告設定」於彙整工具中編輯後存回系統
          </CardDescription>
        </div>
        <div className="px-8 py-6 bg-card">
          <AssembledReport data={report} />
        </div>
      </Card>
    </AppShell>
  );
}
