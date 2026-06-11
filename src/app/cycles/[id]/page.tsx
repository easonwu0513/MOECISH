import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { prisma } from '@/lib/db';
import { auth } from '@/lib/auth';
import { AppShell } from '@/components/shell/AppShell';
import { Card, CardTitle, CardDescription } from '@/components/ui/Card';
import { Chip } from '@/components/ui/Chip';
import { Button } from '@/components/ui/Button';
import { ProgressRing } from '@/components/ui/ProgressRing';
import { CYCLE_STATUS_LABELS, cycleStatusTone, nextStatuses, rollbackTargets } from '@/lib/state-machine';
import { deriveCycleFacts, nextActionForRole } from '@/lib/process-guide';
import { CycleStepper } from '@/components/dashboard/CycleStepper';
import type { CycleStatus, Role } from '@/lib/types';
import { AlertTriangle, ClipboardCheck, Eye, FileText } from '@/components/icons';
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
          <p className="mt-1 text-body text-on-surface-variant truncate">
            {cycle.organization.name}
            {cycle.onsiteDate && (
              <> · 實地稽核 {new Date(cycle.onsiteDate).toLocaleDateString('zh-TW')}</>
            )}
            {' '}· 矯正截止 {new Date(cycle.dueDate).toLocaleDateString('zh-TW')}
          </p>
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
          <CycleStepper current={facts.step} />
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

      {/* 統計 */}
      <section className="grid grid-cols-1 md:grid-cols-3 gap-5 mb-8">
        <Card>
          <div className="flex items-center gap-4">
            <ProgressRing
              value={passed}
              max={total || 1}
              size={80}
              strokeWidth={8}
              tone="success"
              label={`${passed}`}
              sublabel={`/ ${total}`}
            />
            <div>
              <CardTitle>矯正通過</CardTitle>
              <CardDescription>
                {total > 0 ? `共 ${total} 項缺失` : '尚未發布缺失'}
              </CardDescription>
            </div>
          </div>
        </Card>

        <Card>
          <div className="flex items-center gap-4">
            <div className="w-20 h-20 rounded-full bg-sage-50 flex items-center justify-center">
              <Eye size={28} className="text-sage-600" />
            </div>
            <div>
              <CardTitle>待委員審查</CardTitle>
              <CardDescription>{submitted} 項已送審</CardDescription>
            </div>
          </div>
        </Card>

        <Card>
          <div className="flex items-center gap-4">
            <div className="w-20 h-20 rounded-full bg-warning-50 flex items-center justify-center">
              <AlertTriangle size={28} className="text-warning-600" />
            </div>
            <div>
              <CardTitle>待機關處理</CardTitle>
              <CardDescription>
                待填 {pendingCount} · 退回 {returned}
              </CardDescription>
            </div>
          </div>
        </Card>
      </section>

      {/* 模組入口 */}
      <section className="grid grid-cols-1 md:grid-cols-3 gap-5 mb-8">
        <ModuleTile
          icon={<FileText size={22} />}
          tone="sage"
          title="稽核前資料準備"
          desc="實地稽核前，機關上傳稽核表與相關文件；委員確認資料齊備或標記缺件。"
          href={`/cycles/${cycle.id}/prep`}
        />
        <ModuleTile
          icon={<AlertTriangle size={22} />}
          tone="primary"
          title="缺失與矯正管考"
          desc="檢視稽核缺失、填報矯正措施與佐證；委員逐項審查通過或退回補正。"
          href={`/cycles/${cycle.id}/deficiencies`}
        />
        <ModuleTile
          icon={<ClipboardCheck size={22} />}
          tone="primary"
          title="資通安全檢核表"
          desc="行政院檢核項目線上填報:逐題符合度、說明與佐證上傳;每題附法規對照(稽核依據、重點、應備文件)。"
          href={`/cycles/${cycle.id}/checklist`}
        />
      </section>

      {/* 匯出 */}
      <Card className="mb-6">
        <CardTitle>匯出</CardTitle>
        <CardDescription>產出制式公文格式檔案</CardDescription>
        <div className="mt-4 flex flex-wrap gap-2">
          <a href={`/api/cycles/${cycle.id}/export/remediation-report`}>
            <Button variant="tonal" size="sm" leadingIcon={<FileText size={15} />}>
              Word 改善報告
            </Button>
          </a>
          <Link href={`/cycles/${cycle.id}/print`} target="_blank" rel="noopener">
            <Button variant="tonal" size="sm" leadingIcon={<FileText size={15} />}>
              列印版(瀏覽器另存 PDF)
            </Button>
          </Link>
          <a href={`/api/cycles/${cycle.id}/export/checklist`}>
            <Button variant="text" size="sm">Excel 檢核表(選用)</Button>
          </a>
        </div>
      </Card>

      {/* SUPER_ADMIN:委員指派 */}
      {user.role === 'SUPER_ADMIN' && <AssignAuditorsPanel cycleId={cycle.id} />}

      {/* 用印掃描檔(矯正執行中之後顯示) */}
      {(cycle.status === 'REMEDIATION' || cycle.status === 'CLOSED') && (
        <SignedReportPanel cycleId={cycle.id} role={user.role} />
      )}

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
}: {
  icon: React.ReactNode;
  tone: 'primary' | 'sage' | 'neutral';
  title: string;
  desc: string;
  href: string;
}) {
  const iconBg = {
    primary: 'bg-primary-50 text-primary-700',
    sage: 'bg-sage-50 text-sage-700',
    neutral: 'bg-neutral-100 text-neutral-600',
  }[tone];

  return (
    <Link href={href} className="block focus-ring rounded-md">
      <Card interactive>
        <div className="flex items-start gap-4">
          <div className={`w-11 h-11 rounded-lg ${iconBg} flex items-center justify-center shrink-0`}>
            {icon}
          </div>
          <div className="min-w-0">
            <div className="text-title text-on-surface">{title}</div>
            <p className="mt-1.5 text-body-sm text-on-surface-variant leading-relaxed">{desc}</p>
          </div>
        </div>
      </Card>
    </Link>
  );
}
