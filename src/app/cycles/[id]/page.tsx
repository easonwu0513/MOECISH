import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { prisma } from '@/lib/db';
import { auth } from '@/lib/auth';
import { AppShell } from '@/components/shell/AppShell';
import { Card, CardTitle, CardDescription } from '@/components/ui/Card';
import { Chip } from '@/components/ui/Chip';
import { Button } from '@/components/ui/Button';
import { StatTopBar } from '@/components/ui/StatTopBar';
import { CYCLE_STATUS_LABELS, cycleStatusTone, nextStatuses, rollbackTargets } from '@/lib/state-machine';
import { deriveCycleFacts, nextActionForRole } from '@/lib/process-guide';
import { fmtROC } from '@/lib/date';
import { CycleStepper } from '@/components/dashboard/CycleStepper';
import type { CycleStatus, Role } from '@/lib/types';
import { AlertTriangle, ClipboardCheck, Eye, FileText, CheckCircle } from '@/components/icons';
import NotifyButton from './NotifyButton';
import TransitionButton from './TransitionButton';
import AssignAuditorsPanel from './AssignAuditorsPanel';
import SignedReportPanel from './SignedReportPanel';
import EditCycleDialog from './EditCycleDialog';

export default async function CyclePage({ params }: { params: { id: string } }) {
  const session = await auth();
  if (!session) redirect(`/login?callbackUrl=/cycles/${params.id}`);
  const user = session.user;

  const cycle = await prisma.auditCycle.findUnique({
    where: { id: params.id },
    include: {
      organization: true,
      assignments: { include: { auditor: { select: { name: true } } } },
      deficiencies: { include: { action: { select: { status: true } } } },
      prepRequirements: { include: { submission: { select: { status: true } } } },
      signedReports: { select: { id: true, confirmedAt: true } },
    },
  });
  if (!cycle) notFound();

  if (user.role === 'ORG_ADMIN' && cycle.organizationId !== user.organizationId) redirect('/dashboard');
  if (user.role === 'AUDITOR' && !cycle.assignments.some((a) => a.auditorId === user.id)) redirect('/dashboard');

  // 委員視角:本人於此週期的九構面評分進度(磚上徽章)
  const myScoreCount = user.role === 'AUDITOR'
    ? await prisma.auditScore.count({ where: { cycleId: cycle.id, auditorId: user.id } })
    : 0;

  const total = cycle.deficiencies.length;
  const byStatus = (s: string) => cycle.deficiencies.filter((d) => d.action?.status === s).length;
  const passed = byStatus('PASSED');
  const submitted = byStatus('SUBMITTED');
  const returned = byStatus('RETURNED');
  const pendingCount = total - passed - submitted - returned ? total - passed - submitted - returned : 0;

  const transitions = nextStatuses(cycle.status as CycleStatus, user.role as Role);
  const rollbacks = rollbackTargets(cycle.status as CycleStatus, user.role as Role);
  const yearROC = cycle.year - 1911;

  // 流程位置與角色化下一步(與 dashboard 共用 process-guide)
  const facts = deriveCycleFacts(cycle);
  const next = nextActionForRole(user.role, facts);
  const showCta = !!(next?.href && next.cta && next.href !== `/cycles/${cycle.id}`);

  // 模組卡狀態徽章(進度一目了然;僅用已查到的資料,不額外加查詢)
  const prepTotal = cycle.prepRequirements.length;
  const prepConfirmed = cycle.prepRequirements.filter((r) => r.submission?.status === 'CONFIRMED').length;
  const prepBadge = prepTotal > 0
    ? <Chip tone={prepConfirmed === prepTotal ? 'success' : 'neutral'} size="sm">{prepConfirmed}/{prepTotal} 齊備</Chip>
    : undefined;
  const checklistBadge = cycle.checklistSubmittedAt
    ? <Chip tone="success" size="sm" dot>已送出</Chip>
    : undefined;
  const auditBadge = user.role === 'AUDITOR'
    ? <Chip tone={myScoreCount >= 9 ? 'success' : 'neutral'} size="sm">評分 {myScoreCount}/9</Chip>
    : undefined;
  const defBadge = total > 0
    ? <Chip tone={passed === total ? 'success' : 'neutral'} size="sm">{passed}/{total} 通過</Chip>
    : undefined;

  // 矯正截止壓力提示(僅矯正執行中且未全通過時;以本地日界計天數,與追蹤信一致)
  const dueDay = new Date(cycle.dueDate); dueDay.setHours(0, 0, 0, 0);
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const daysToDue = Math.round((dueDay.getTime() - today.getTime()) / 86400000);
  const showDeadlineChip = cycle.status === 'REMEDIATION' && !facts.allPassed;
  const deadlineChip = showDeadlineChip
    ? (facts.overdue
        ? <Chip tone="danger" size="sm" dot>已逾期 {Math.abs(daysToDue)} 天</Chip>
        : <Chip tone="warning" size="sm" dot>距截止剩 {daysToDue} 天</Chip>)
    : null;

  return (
    <AppShell
      user={{ name: user.name, email: user.email, role: user.role, organizationName: user.organizationName }}
      cycleId={cycle.id}
      crumbs={[
        { label: '總覽', href: '/dashboard' },
        { label: '稽核週期', href: '/cycles' },
        { label: `${yearROC} 年度 · ${cycle.organization.name}` },
      ]}
    >
      <header className="mb-6 flex items-start justify-between gap-4 flex-wrap">
        <div className="min-w-0">
          <h1 className="text-headline text-on-surface">
            {yearROC} 年度資通安全稽核
          </h1>
          <p className="mt-1 text-body-sm text-on-surface-variant truncate">
            {cycle.organization.name}
            {cycle.onsiteDate && (
              <> · 實地稽核 {fmtROC(cycle.onsiteDate)}</>
            )}
            {' '}· 矯正截止 {fmtROC(cycle.dueDate)}
          </p>
          {deadlineChip && <div className="mt-2">{deadlineChip}</div>}
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {user.role === 'SUPER_ADMIN' && cycle.status !== 'CLOSED' && (
            <EditCycleDialog
              cycleId={cycle.id}
              dueDate={cycle.dueDate.toISOString()}
              prepDueDate={cycle.prepDueDate?.toISOString() ?? null}
              onsiteDate={cycle.onsiteDate?.toISOString() ?? null}
            />
          )}
          <Chip tone={cycleStatusTone(cycle.status as CycleStatus)} size="md" dot>
            {CYCLE_STATUS_LABELS[cycle.status as CycleStatus]}
          </Chip>
        </div>
      </header>

      {/* 流程位置 + 下一步 */}
      <section className="mb-8 rounded-md border border-outline-variant/60 bg-surface-container-lowest overflow-hidden">
        <div className="px-5 pt-4 pb-3.5">
          <CycleStepper current={facts.step} statusLabel={CYCLE_STATUS_LABELS[cycle.status as CycleStatus]} />
        </div>
        {next ? (
          <div className="flex items-center gap-3 px-5 py-3 border-t border-outline-variant/60 bg-primary-50/40 flex-wrap">
            <span className="text-label-sm font-semibold text-primary-800 tracking-[0.06em] shrink-0">下一步</span>
            <span className="text-body-sm text-on-surface flex-1 min-w-44">{next.text}</span>
            {showCta && (
              <Link href={next.href!} className="shrink-0">
                <Button size="sm" variant="tonal">{next.cta}</Button>
              </Link>
            )}
          </div>
        ) : (
          <div className="px-5 py-3 border-t border-outline-variant/60 text-body-sm text-on-surface-variant">
            本週期已結案,全部流程完成。
          </div>
        )}
      </section>

      {/* 統計(三卡統一三段式:大數字 + 標題 + 一行說明,與總覽同語彙) */}
      <section className="grid grid-cols-1 md:grid-cols-3 gap-5 mb-8">
        <StatTopBar
          tone="success"
          icon={<CheckCircle size={20} />}
          primary={total > 0 ? `${passed}/${total}` : '—'}
          label="矯正通過"
          sub={total > 0 ? `共 ${total} 項缺失` : '尚未發布缺失'}
          muted={total === 0}
        />
        <StatTopBar
          tone="sage"
          icon={<Eye size={20} />}
          primary={`${submitted}`}
          label="待委員審查"
          sub={submitted > 0 ? '委員審查中' : '無待審項目'}
          muted={submitted === 0}
        />
        <StatTopBar
          tone="warning"
          icon={<AlertTriangle size={20} />}
          primary={`${pendingCount + returned}`}
          label="待機關處理"
          sub={`待填 ${pendingCount} · 退回 ${returned}`}
          muted={pendingCount + returned === 0}
        />
      </section>

      {/* 模組入口(委員/管理員多「實地稽核」「委員審閱」) */}
      <section
        className={`grid grid-cols-1 gap-5 mb-8 ${
          user.role === 'ORG_ADMIN' ? 'md:grid-cols-3' : 'md:grid-cols-2 lg:grid-cols-3'
        }`}
      >
        <ModuleTile
          icon={<FileText size={22} />}
          tone="sage"
          title="稽核前資料準備"
          desc="實地稽核前，機關上傳文件或敘明無相關文件後「確定繳交」；中心確認資料齊備或退回補正。"
          href={`/cycles/${cycle.id}/prep`}
          badge={prepBadge}
        />
        <ModuleTile
          icon={<ClipboardCheck size={22} />}
          tone="primary"
          title="資通安全檢核表"
          desc="行政院檢核項目線上填報:逐題符合度、說明與佐證上傳;每題附法規對照(稽核依據、重點、應備文件)。"
          href={`/cycles/${cycle.id}/checklist`}
          badge={checklistBadge}
        />
        {user.role !== 'ORG_ADMIN' && (
          <ModuleTile
            icon={<Eye size={22} />}
            tone="sage"
            title="實地稽核評分與發現"
            desc="稽核當天:委員線上評分(檢核統計自動帶入)與逐條輸入發現;系統即時彙整成完整報告。"
            href={`/cycles/${cycle.id}/audit`}
            badge={auditBadge}
          />
        )}
        {user.role !== 'ORG_ADMIN' && (
          <ModuleTile
            icon={<CheckCircle size={22} />}
            tone="primary"
            title="委員審閱(檢核表)"
            desc="逐題檢視機關填報的符合度與佐證,於每題留下審查意見;可退回補正或維持送審。"
            href={`/cycles/${cycle.id}/review`}
          />
        )}
        <ModuleTile
          icon={<AlertTriangle size={22} />}
          tone="primary"
          title="缺失與矯正管考"
          desc="檢視稽核缺失、填報矯正措施與佐證；委員逐項審查通過或退回補正。"
          href={`/cycles/${cycle.id}/deficiencies`}
          badge={defBadge}
        />
      </section>

      {/* 用印報告(矯正執行中之後顯示):結案最後一哩,移到動線前段並就近提供下載 */}
      {(cycle.status === 'REMEDIATION' || cycle.status === 'CLOSED') && (
        <section id="signed-report" className="mb-6 scroll-mt-20">
          <SignedReportPanel cycleId={cycle.id} role={user.role} />
        </section>
      )}

      {/* 匯出 */}
      <Card className="mb-6">
        <CardTitle>匯出</CardTitle>
        <CardDescription>
          產出制式公文格式檔案。
          {user.role === 'ORG_ADMIN'
            ? '「遞交版」為送主管機關之正式檔。'
            : '「遞交版」為送主管機關正本;「工作底稿」供稽核方內部審查用。'}
        </CardDescription>
        <div className="mt-4 flex flex-wrap gap-2">
          {total > 0 ? (
            <a href={`/api/cycles/${cycle.id}/export/remediation-report`}>
              <Button variant="tonal" size="sm" leadingIcon={<FileText size={15} />}>Word 改善報告</Button>
            </a>
          ) : (
            <span title="缺失發布後才能匯出改善報告">
              <Button variant="tonal" size="sm" disabled leadingIcon={<FileText size={15} />}>Word 改善報告</Button>
            </span>
          )}
          {total > 0 ? (
            <Link href={`/cycles/${cycle.id}/print`} target="_blank" rel="noopener">
              <Button variant="tonal" size="sm" leadingIcon={<FileText size={15} />}>列印版(瀏覽器另存 PDF)</Button>
            </Link>
          ) : (
            <span title="缺失發布後才能列印改善報告">
              <Button variant="tonal" size="sm" disabled leadingIcon={<FileText size={15} />}>列印版(瀏覽器另存 PDF)</Button>
            </span>
          )}
          {cycle.checklistSubmittedAt ? (
            <a href={`/api/cycles/${cycle.id}/export/checklist?format=docx`}>
              <Button variant="tonal" size="sm" leadingIcon={<FileText size={15} />}>Word 檢核表(遞交版)</Button>
            </a>
          ) : (
            <span title="檢核表送出後才能匯出遞交版">
              <Button variant="tonal" size="sm" disabled leadingIcon={<FileText size={15} />}>Word 檢核表(遞交版)</Button>
            </span>
          )}
          {/* 工作底稿為稽核方內部用,機關端不顯示(避免「這顆是不是給我按的」猶豫) */}
          {user.role !== 'ORG_ADMIN' && (
            <a href={`/api/cycles/${cycle.id}/export/checklist`}>
              <Button variant="text" size="sm">Excel 檢核表(工作底稿)</Button>
            </a>
          )}
        </div>
      </Card>

      {/* SUPER_ADMIN:委員指派 */}
      {user.role === 'SUPER_ADMIN' && <AssignAuditorsPanel cycleId={cycle.id} />}

      {/* SUPER_ADMIN:管理動作 */}
      {user.role === 'SUPER_ADMIN' && (
        <Card className="mb-6">
          <CardTitle>管理動作</CardTitle>
          <CardDescription>通知機關管理員、推進週期狀態</CardDescription>
          <div className="mt-4 flex flex-wrap items-center gap-2">
            {/* 通知機關填報只在缺失發布後才有意義 */}
            {(cycle.status === 'REPORT_ISSUED' || cycle.status === 'REMEDIATION') && (
              <NotifyButton cycleId={cycle.id} />
            )}
            {transitions.map((t) => (
              <TransitionButton key={t} cycleId={cycle.id} target={t} />
            ))}
            {rollbacks.length > 0 && <span className="w-px h-5 bg-outline-variant mx-1" aria-hidden />}
            {rollbacks.map((t) => (
              <TransitionButton key={`rb-${t}`} cycleId={cycle.id} target={t} rollback />
            ))}
          </div>
        </Card>
      )}
    </AppShell>
  );
}

function ModuleTile({
  icon,
  tone,
  title,
  desc,
  href,
  badge,
}: {
  icon: React.ReactNode;
  tone: 'primary' | 'sage' | 'neutral';
  title: string;
  desc: string;
  href: string;
  /** 右上角狀態徽章(進度一目了然);無進度可省略 */
  badge?: React.ReactNode;
}) {
  const iconBg = {
    primary: 'bg-primary-50 text-primary-700',
    sage: 'bg-sage-50 text-sage-700',
    neutral: 'bg-neutral-100 text-neutral-600',
  }[tone];

  return (
    <Link href={href} className="block h-full focus-ring rounded-md">
      <Card interactive className="h-full">
        <div className="flex items-start gap-4">
          <div className={`w-11 h-11 rounded-lg ${iconBg} flex items-center justify-center shrink-0`}>
            {icon}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-start justify-between gap-2">
              <div className="text-title text-on-surface">{title}</div>
              {badge && <div className="shrink-0">{badge}</div>}
            </div>
            <p className="mt-1.5 text-body-sm text-on-surface-variant leading-relaxed">{desc}</p>
          </div>
        </div>
      </Card>
    </Link>
  );
}
