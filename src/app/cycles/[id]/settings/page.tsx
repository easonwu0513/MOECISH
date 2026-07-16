import { notFound, redirect } from 'next/navigation';
import { prisma } from '@/lib/db';
import { auth } from '@/lib/auth';
import { AppShell } from '@/components/shell/AppShell';
import { Card, CardTitle, CardDescription } from '@/components/ui/Card';
import { Chip } from '@/components/ui/Chip';
import { CYCLE_STATUS_LABELS, cycleStatusTone, nextStatuses, rollbackTargets } from '@/lib/state-machine';
import { canAssignAuditors } from '@/lib/stage';
import { CycleHubBar } from '@/components/cycle/CycleHubBar';
import type { CycleStatus, Role } from '@/lib/types';
import TransitionButton from '../TransitionButton';
import AssignAuditorsPanel from '../AssignAuditorsPanel';
import AssignObserversPanel from '../AssignObserversPanel';
import NotifyButton from '../NotifyButton';
import EditCycleDialog from '../EditCycleDialog';
import DeleteCycleButton from '@/components/cycle/DeleteCycleButton';

/**
 * 進階設定獨立頁(批34 圖5):把原週期頁頁尾 #advanced-settings 集中區(編輯日期/推進·回退階段/
 * 委員指派/觀察員配對/矯正通知/刪除週期)搬到獨立頁面,讓週期工作台更簡潔。僅最高管理員可進。
 * 頂部卡快捷鍵(編輯日期/推進)仍保留在週期頁(捷徑),此頁為完整版位。
 */
export default async function CycleSettingsPage({ params }: { params: { id: string } }) {
  const session = await auth();
  if (!session) redirect(`/login?callbackUrl=/cycles/${params.id}/settings`);
  const user = session.user;
  if (user.role !== 'SUPER_ADMIN') redirect(`/cycles/${params.id}`);

  const cycle = await prisma.auditCycle.findUnique({
    where: { id: params.id },
    include: {
      organization: true,
      prepRequirements: { select: { required: true, submission: { select: { status: true } } } },
    },
  });
  if (!cycle) notFound();

  const yearROC = cycle.year - 1911;
  const transitions = nextStatuses(cycle.status as CycleStatus, user.role as Role);
  const rollbacks = rollbackTargets(cycle.status as CycleStatus, user.role as Role);

  // 「資料齊備」推進前置(與週期頁同規則):必要資料全確認 + 檢核表已送出
  const readyBlockers: string[] = [];
  if (cycle.status === 'PREPARATION') {
    const reqNotConfirmed = cycle.prepRequirements.filter(
      (r) => r.required && r.submission?.status !== 'CONFIRMED',
    ).length;
    if (reqNotConfirmed > 0) readyBlockers.push(`${reqNotConfirmed} 份必要資料未確認齊備`);
    if (!cycle.checklistSubmittedAt) readyBlockers.push('檢核表尚未送出');
  }

  return (
    <AppShell
      user={{ name: user.name, email: user.email, role: user.role, organizationName: user.organizationName }}
      cycleId={cycle.id}
      crumbs={[
        { label: '總覽', href: '/dashboard' },
        { label: '稽核週期', href: '/cycles' },
        { label: `${yearROC} 年度 · ${cycle.organization.name}`, href: `/cycles/${cycle.id}` },
        { label: '進階設定' },
      ]}
    >
      <CycleHubBar
        cycleId={cycle.id}
        label={`${yearROC} 年度 · ${cycle.organization.shortName ?? cycle.organization.name}`}
        nextHint="設定完成後，回工作台查看下一步"
      />
      <header className="mb-5">
        <h1 className="text-headline text-ink-900">進階設定</h1>
        <p className="mt-1 text-body-sm text-ink-500">
          編輯週期日期、控制稽核階段、指派委員與配對觀察員；矯正通知、狀態回退與刪除週期。
        </p>
      </header>

      <Card className="mb-4">
        <CardTitle>週期日期與階段</CardTitle>
        <CardDescription>編輯週期日期、控制稽核階段；矯正通知、狀態回退與刪除</CardDescription>

        {/* 日期 */}
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <span className="text-body-sm text-ink-500 w-20 shrink-0">週期日期</span>
          <EditCycleDialog
            cycleId={cycle.id}
            dueDate={cycle.dueDate?.toISOString() ?? ''}
            prepDueDate={cycle.prepDueDate?.toISOString() ?? null}
            prepDueTech={cycle.prepDueTech?.toISOString() ?? null}
            techCheckDate={cycle.techCheckDate?.toISOString() ?? null}
            onsiteDate={cycle.onsiteDate?.toISOString() ?? null}
          />
          <span className="text-caption text-ink-500">
            實地稽核 / 技術檢測 / 文件繳交截止 / 矯正截止
          </span>
        </div>

        {/* 階段 */}
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <span className="text-body-sm text-ink-500 w-20 shrink-0">稽核階段</span>
          <Chip tone={cycleStatusTone(cycle.status as CycleStatus)} size="sm" dot>
            目前：{CYCLE_STATUS_LABELS[cycle.status as CycleStatus]}
          </Chip>
          {cycle.status !== 'CLOSED' && transitions.map((t) => (
            <TransitionButton
              key={`adv-${t}`}
              cycleId={cycle.id}
              target={t}
              disabled={t === 'READY' && readyBlockers.length > 0}
              disabledHint={t === 'READY' && readyBlockers.length > 0 ? `尚未齊備：${readyBlockers.join('、')}` : undefined}
              warn={
                !cycle.dueDate && (t === 'REPORT_ISSUED' || t === 'REMEDIATION')
                  ? '缺失發布後機關須依此日期填報矯正措施。建議先設定矯正截止日；如稍後再設，可確認後繼續推進。'
                  : undefined
              }
            />
          ))}
          {rollbacks.map((t) => (
            <TransitionButton key={`rb-${t}`} cycleId={cycle.id} target={t} rollback />
          ))}
        </div>

        {/* 其他管理動作 */}
        {(cycle.status === 'REMEDIATION' || cycle.status === 'DRAFT') && (
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <span className="text-body-sm text-ink-500 w-20 shrink-0">其他</span>
            {cycle.status === 'REMEDIATION' && <NotifyButton cycleId={cycle.id} />}
            {cycle.status === 'DRAFT' && (
              <DeleteCycleButton
                cycleId={cycle.id}
                orgName={cycle.organization.shortName ?? cycle.organization.name}
                yearROC={yearROC}
                redirectTo="/admin/cycles"
              />
            )}
          </div>
        )}
      </Card>

      {/* 委員指派;#assign-auditors 錨點保留供儀表板/精靈深連結 */}
      <div id="assign-auditors" className="scroll-mt-24">
        <AssignAuditorsPanel
          cycleId={cycle.id}
          canAssign={canAssignAuditors(cycle.status as CycleStatus)}
          confirmOnAssign={cycle.status === 'ONSITE'}
        />
      </div>

      {/* 觀察員配對(批30 師徒制) */}
      <div id="assign-observers" className="mt-4 scroll-mt-24">
        <AssignObserversPanel
          cycleId={cycle.id}
          canAssign={canAssignAuditors(cycle.status as CycleStatus)}
        />
      </div>
    </AppShell>
  );
}
