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
import { toneClasses, canAssignAuditors } from '@/lib/stage';
import { parseAssignDimensions, ASSIGN_ASPECT_LABELS } from '@/lib/audit-score';
import { deriveCycleFacts, nextActionForRole } from '@/lib/process-guide';
import { PrimaryActionBanner } from '@/components/dashboard/PrimaryActionBanner';
import { IdentityBand } from '@/components/dashboard/IdentityBand';
import { fmtROC } from '@/lib/date';
import { StageFlowRail } from '@/components/dashboard/StageFlowRail';
import { JourneyChecklist } from '@/components/journey/JourneyChecklist';
import { loadJourney, toClientStages } from '@/lib/journey';
import { ProgressRing } from '@/components/ui/ProgressRing';
import { StackedBar } from '@/components/ui/StackedBar';
import { auditorCanViewChecklistContent, auditorCanScore, auditorCanSeeCycle, DEFICIENCY_ASPECT_LABELS, type CycleStatus, type Role, type DeficiencyAspect } from '@/lib/types';
import { canAccess } from '@/lib/access-policy';
import { AlertTriangle, ClipboardCheck, Eye, FileText, CheckCircle } from '@/components/icons';
import NotifyButton from './NotifyButton';
import NotifyOrgButton from './NotifyOrgButton';
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
      checklistVersion: { select: { _count: { select: { items: true } } } },
      responses: { select: { compliance: true, comments: { where: { resolvedAt: null }, select: { id: true } } } },
    },
  });
  if (!cycle) notFound();

  if (user.role === 'ORG_ADMIN' && cycle.organizationId !== user.organizationId) redirect('/dashboard');
  // 委員:未指派 → 導回;開立中(DRAFT)亦不可見(中心仍在調整名單,PREPARATION 起才開放)
  if (user.role === 'AUDITOR' && (!cycle.assignments.some((a) => a.auditorId === user.id) || !auditorCanSeeCycle(cycle.status))) redirect('/dashboard');

  // 委員視角:本人於此週期受指派負責的構面(標頭標註;評分不再以 X/9 呈現,因各委員只評負責構面)
  const myAssignment = user.role === 'AUDITOR' ? cycle.assignments.find((a) => a.auditorId === user.id) : null;
  const myAssignedLabels = myAssignment
    ? parseAssignDimensions(myAssignment.dimensions).map((d) => ASSIGN_ASPECT_LABELS[d])
    : [];

  const total = cycle.deficiencies.length;
  const byStatus = (s: string) => cycle.deficiencies.filter((d) => d.action?.status === s).length;
  const passed = byStatus('PASSED');
  const submitted = byStatus('SUBMITTED');
  const returned = byStatus('RETURNED');
  const pendingCount = total - passed - submitted - returned ? total - passed - submitted - returned : 0;

  // 構面數據資訊:各稽核構面(策略/管理/技術)的缺失矯正通過進度(逐構面 passed/total)
  const ASPECTS: DeficiencyAspect[] = ['STRATEGY', 'MANAGEMENT', 'TECHNICAL'];
  const aspectProgress = ASPECTS.map((asp) => {
    const items = cycle.deficiencies.filter((d) => d.aspect === asp);
    return { asp, passed: items.filter((d) => d.action?.status === 'PASSED').length, total: items.length };
  });

  const transitions = nextStatuses(cycle.status as CycleStatus, user.role as Role);
  const rollbacks = rollbackTargets(cycle.status as CycleStatus, user.role as Role);
  const yearROC = cycle.year - 1911;

  // 流程位置與角色化下一步(與 dashboard 共用 process-guide)
  const facts = deriveCycleFacts(cycle, undefined, user.role === 'AUDITOR' ? user.id : undefined);
  const next = nextActionForRole(user.role, facts);

  // 階段聚焦:只有「當前階段相關」的入口維持高亮,其餘降權(仍可點),讓現在該做的最突出
  const stForMod = cycle.status as CycleStatus;
  const modActive = {
    prep: stForMod === 'DRAFT' || stForMod === 'PREPARATION',
    checklist: stForMod === 'PREPARATION' || stForMod === 'ONSITE',
    audit: stForMod === 'ONSITE',
    review: stForMod === 'ONSITE',
    deficiencies: stForMod === 'REPORT_ISSUED' || stForMod === 'REMEDIATION' || stForMod === 'CLOSED',
  };
  // 主行動橫幅:下一步連結若就是本頁則不顯示 CTA(避免自連)
  // 主行動橫幅:下一步若指回本頁(多為「推進狀態」類動作),SUPER 導向頁內管理動作區(避免無按鈕死路);
  // 其餘角色無管理動作區,則退為純文字(不顯示假按鈕)。
  const selfHref = `/cycles/${cycle.id}`;
  const bannerNext =
    next && next.href === selfHref
      ? user.role === 'SUPER_ADMIN'
        ? { ...next, href: `${selfHref}#management`, cta: next.cta ?? '前往處理' }
        : { ...next, href: undefined, cta: undefined }
      : next;

  // 模組卡狀態徽章(進度一目了然;僅用已查到的資料,不額外加查詢)
  // 機關只看自己負責的機關區(技術檢測/實地稽核),扣除中心匯入區;中心/委員看全部
  const prepTotal = user.role === 'ORG_ADMIN' ? facts.mechTotal : cycle.prepRequirements.length;
  const prepConfirmed = user.role === 'ORG_ADMIN'
    ? facts.mechConfirmed
    : cycle.prepRequirements.filter((r) => r.submission?.status === 'CONFIRMED').length;
  // 進度讀數(退補/待繳/未處理)同樣 role-aware:機關只看機關區(mech*),中心看全部(prep*)。
  // 週期頁大讀數卡與模組徽章共用同一組,避免機關看到含中心匯入的虛高數字(使用者反覆回報之點)。
  const prepInsufficient = user.role === 'ORG_ADMIN' ? facts.mechInsufficient : facts.prepInsufficient;
  const prepDraft = user.role === 'ORG_ADMIN' ? facts.mechDraft : facts.prepDraft;
  const prepRemaining = user.role === 'ORG_ADMIN' ? facts.mechRemaining : facts.prepRemaining;
  const prepBadge = prepTotal > 0
    ? <Chip tone={prepConfirmed === prepTotal ? 'success' : 'neutral'} size="sm">{prepConfirmed}/{prepTotal} 齊備</Chip>
    : undefined;
  const checklistBadge = cycle.checklistSubmittedAt
    ? <Chip tone="success" size="sm" dot>已送出</Chip>
    : undefined;
  const defBadge = total > 0
    ? <Chip tone={passed === total ? 'success' : 'neutral'} size="sm">{passed}/{total} 通過</Chip>
    : undefined;

  // 矯正截止壓力提示(僅矯正執行中且未全通過時;以本地日界計天數,與追蹤信一致)
  const dueDay = cycle.dueDate ? new Date(cycle.dueDate) : null;
  dueDay?.setHours(0, 0, 0, 0);
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const daysToDue = dueDay ? Math.round((dueDay.getTime() - today.getTime()) / 86400000) : 0;
  const showDeadlineChip = cycle.status === 'REMEDIATION' && !facts.allPassed && !!cycle.dueDate;
  const deadlineChip = showDeadlineChip
    ? (facts.overdue
        ? <Chip tone="danger" size="sm" dot>已逾期 {Math.abs(daysToDue)} 天</Chip>
        : <Chip tone="warning" size="sm" dot>距截止剩 {daysToDue} 天</Chip>)
    : null;

  // 是否已寄發「稽核作業通知」給機關(精靈開立中「通知機關」項自動完成判定;notify-open 留下的 EmailLog)
  const orgNotified = (await prisma.emailLog.count({
    where: { relatedCycleId: cycle.id, kind: 'cycle-notify', context: { contains: '"phase":"cycle-opened"' } },
  })) > 0;
  // 中心匯入區資料是否皆已上傳並「開放委員檢視」(CONFIRMED);無中心匯入項則視為完成(精靈「上傳中心匯入區資料」項判定)
  const centerDataReleased = cycle.prepRequirements
    .filter((r) => r.category === 'CENTER')
    .every((r) => r.submission?.status === 'CONFIRMED');

  // 引導式精靈(本週期各階段 checklist):中心看全部(含角色標籤)、機關/委員看自己角色 + 全體項。
  const journeyRole = user.role === 'SUPER_ADMIN' ? undefined : (user.role as Role);
  const journeyView = await loadJourney({
    scope: 'CYCLE',
    cycleId: cycle.id,
    role: journeyRole,
    autoCtx: { facts, assignmentsCount: cycle.assignments.length, orgNotified, centerDataReleased },
  });
  const journeyStages = journeyView ? toClientStages(journeyView, user.role as Role) : [];

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
      {/* 身分帶(與儀表板同骨架,統一工作台頂部;大標降一級,讓主行動橫幅為唯一最大焦點) */}
      <h1 className="sr-only">{yearROC} 年度資通安全稽核 · {cycle.organization.name}</h1>
      {/* 開立中設定的快捷錨點:精靈「建立/設定截止日」項目與「去設定」CTA 跳轉至此(編輯日期在身分帶) */}
      <div id="setup" className="scroll-mt-24" aria-hidden />
      <IdentityBand
        avatar={cycle.organization.name.slice(0, 1)}
        title={`${yearROC} 年度資通安全稽核`}
        subtitle={
          <>
            {cycle.organization.name}
            {cycle.onsiteDate && <> · 實地稽核 {fmtROC(cycle.onsiteDate)}</>}
            {' · '}
            {cycle.dueDate ? <>矯正截止 {fmtROC(cycle.dueDate)}</> : '矯正截止日期尚未設定'}
            {myAssignedLabels.length > 0 && <> · 您負責構面:{myAssignedLabels.join('、')}</>}
          </>
        }
        roleChip={
          <Chip tone={cycleStatusTone(cycle.status as CycleStatus)} size="sm" dot>
            {CYCLE_STATUS_LABELS[cycle.status as CycleStatus]}
          </Chip>
        }
        right={
          user.role === 'SUPER_ADMIN' && cycle.status !== 'CLOSED' ? (
            <div className="flex items-center gap-1">
              {/* 通知機關:開立中 / 資料準備中,中心設定好日期、確認時程後正式通知填報人 */}
              {(cycle.status === 'DRAFT' || cycle.status === 'PREPARATION') && (
                <NotifyOrgButton
                  cycleId={cycle.id}
                  orgName={cycle.organization.shortName ?? cycle.organization.name}
                  datesConfirmed={Boolean(cycle.onsiteDate)}
                />
              )}
              <EditCycleDialog
                cycleId={cycle.id}
                dueDate={cycle.dueDate?.toISOString() ?? ''}
                prepDueDate={cycle.prepDueDate?.toISOString() ?? null}
                prepDueTech={cycle.prepDueTech?.toISOString() ?? null}
                techCheckDate={cycle.techCheckDate?.toISOString() ?? null}
                onsiteDate={cycle.onsiteDate?.toISOString() ?? null}
              />
            </div>
          ) : undefined
        }
        className="mb-4"
      />
      {deadlineChip && <div className="mb-5">{deadlineChip}</div>}

      {/* 主行動橫幅:建議的下一步(③ 招牌元件,取代原本細條下一步) */}
      <PrimaryActionBanner next={bannerNext} subtext={`${cycle.organization.name} · ${yearROC} 年度`} className="mb-5" />

      {/* 流程位置:7 階段引導流程帶(取代 4 步 Stepper) */}
      <section className="mb-6 rounded-lg border border-outline-variant/60 bg-surface-container-lowest px-5 py-4">
        <p className="text-label-sm font-medium uppercase tracking-[0.08em] text-on-surface-variant mb-3">稽核週期進度</p>
        <StageFlowRail status={cycle.status as CycleStatus} />
      </section>

      {/* 引導式精靈:各階段該做什麼(可勾選、存檔;預設展開目前階段) */}
      {journeyStages.length > 0 && (
        <section className="mb-8">
          <div className="flex items-center justify-between gap-3 mb-3">
            <p className="text-label-sm font-medium uppercase tracking-[0.08em] text-on-surface-variant">
              引導式精靈 · 各階段任務
              <span className="ml-2 normal-case tracking-normal text-on-surface-variant/80">依系統進度自動更新</span>
            </p>
            {journeyView && journeyView.total > 0 && (
              <span className="text-caption text-on-surface-variant tabular-nums">
                已完成 {journeyView.doneCount}/{journeyView.total}
              </span>
            )}
          </div>
          <JourneyChecklist
            scope="CYCLE"
            binding={{ cycleId: cycle.id }}
            stages={journeyStages}
            defaultOpenStageKey={cycle.status}
            showRoleChips={user.role === 'SUPER_ADMIN'}
          />
        </section>
      )}

      {/* 本階段進度讀數(資料準備中):機關/中心關心的「還剩什麼」;委員此階段尚不可見機關資料,不顯示(避免退補/待繳/未處理誤導委員) */}
      {cycle.status === 'PREPARATION' && user.role !== 'AUDITOR' && (prepTotal > 0 || facts.checklistTotal > 0) && (
        <section className="mb-8 grid gap-4 sm:grid-cols-2">
          {prepTotal > 0 && (
            <Card className="flex items-center gap-4">
              <ProgressRing
                value={prepConfirmed}
                max={prepTotal}
                size={76}
                tone="primary"
                label={`${prepConfirmed}/${prepTotal}`}
                sublabel="已齊備"
              />
              <div className="min-w-0">
                <p className="text-title-md text-on-surface">稽核前資料準備</p>
                <p className="mt-1 text-body-sm text-on-surface-variant">
                  退補 {prepInsufficient} · 待繳 {prepDraft} · 未處理 {prepRemaining}
                </p>
              </div>
            </Card>
          )}
          {facts.checklistTotal > 0 && (
            <Card>
              <p className="text-title-md text-on-surface">資安自評檢核表</p>
              <p className="mt-1 mb-3 text-body-sm text-on-surface-variant tabular-nums">
                {facts.checklistAnswered} / {facts.checklistTotal} 題已填{facts.checklistSubmitted ? ' · 已送出' : ' · 尚未送出'}
              </p>
              <StackedBar
                height={10}
                legend
                segments={[
                  { value: facts.checklistAnswered, tone: 'success', label: '已填' },
                  { value: facts.checklistTotal - facts.checklistAnswered, tone: 'neutral', label: '未填' },
                ]}
              />
            </Card>
          )}
        </section>
      )}

      {/* 統計(三卡:僅在已有缺失時顯示,資料準備/齊備等前段階段不擺空的缺失指標) */}
      {total > 0 && (
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
      )}

      {/* 構面數據資訊:逐構面矯正進度(有缺失時顯示,補足上排三卡的整體讀數) */}
      {total > 0 && (
        <section className="mb-8">
          <Card>
            <div className="flex items-end justify-between gap-3 mb-4">
              <div>
                <p className="text-title-md text-on-surface">構面矯正進度</p>
                <p className="text-body-sm text-on-surface-variant mt-0.5">各稽核構面的缺失矯正通過情形</p>
              </div>
              <div className="text-right shrink-0">
                <p className="text-headline text-on-surface tabular-nums leading-none">{Math.round((passed / total) * 100)}%</p>
                <p className="text-caption text-on-surface-variant mt-1">整體 {passed}/{total}</p>
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-3">
              {aspectProgress.map(({ asp, passed: p, total: t }) => {
                const pct = t > 0 ? Math.round((p / t) * 100) : 0;
                return (
                  <div key={asp}>
                    <div className="flex justify-between items-baseline text-body-sm mb-1.5">
                      <span className="font-medium text-on-surface">{DEFICIENCY_ASPECT_LABELS[asp]}</span>
                      <span className="text-on-surface-variant tabular-nums">{t > 0 ? `${p}/${t}` : '—'}</span>
                    </div>
                    <div className="h-2 rounded-full bg-surface-container-high overflow-hidden">
                      <div className="h-full rounded-full bg-primary-600 transition-all duration-500" style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </Card>
        </section>
      )}

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
          muted={!modActive.prep}
          locked={
            (user.role === 'AUDITOR' && !auditorCanViewChecklistContent(cycle.status)) ||
            (user.role === 'ORG_ADMIN' && cycle.status === 'DRAFT')
          }
          lockedHint={user.role === 'ORG_ADMIN' ? '中心推進至「資料準備中」後開放填報' : '資料齊備後開放委員檢視'}
        />
        <ModuleTile
          icon={<ClipboardCheck size={22} />}
          tone="primary"
          title="資通安全檢核表"
          desc="行政院檢核項目線上填報:逐題符合度、說明與佐證上傳;每題附法規對照(稽核依據、重點、應備文件)。"
          href={`/cycles/${cycle.id}/checklist`}
          badge={checklistBadge}
          muted={!modActive.checklist}
          locked={
            (user.role === 'AUDITOR' && !auditorCanViewChecklistContent(cycle.status)) ||
            (user.role === 'ORG_ADMIN' && cycle.status === 'DRAFT')
          }
          lockedHint={user.role === 'ORG_ADMIN' ? '中心推進至「資料準備中」後開放填報' : '資料齊備後開放委員檢視'}
        />
        {user.role !== 'ORG_ADMIN' && (
          <ModuleTile
            icon={<Eye size={22} />}
            tone="sage"
            title="實地稽核評分與發現"
            desc="稽核當天:委員線上評分(檢核統計自動帶入)與逐條輸入發現;系統即時彙整成完整報告。"
            href={`/cycles/${cycle.id}/audit`}
            muted={!modActive.audit}
            locked={user.role === 'AUDITOR' && !auditorCanScore(cycle.status)}
            lockedHint="實地稽核階段開放"
          />
        )}
        {user.role !== 'ORG_ADMIN' && (
          <ModuleTile
            icon={<CheckCircle size={22} />}
            tone="primary"
            title="委員審閱(檢核表)"
            desc="逐題檢視機關填報的符合度與佐證,於每題留下審查意見;可退回補正或維持送審。"
            href={`/cycles/${cycle.id}/review`}
            muted={!modActive.review}
            locked={user.role === 'AUDITOR' && !auditorCanViewChecklistContent(cycle.status)}
            lockedHint="資料齊備後開放"
          />
        )}
        <ModuleTile
          icon={<AlertTriangle size={22} />}
          tone="primary"
          title="缺失與矯正管考"
          desc="檢視稽核缺失、填報矯正措施與佐證；委員逐項審查通過或退回補正。"
          href={`/cycles/${cycle.id}/deficiencies`}
          badge={defBadge}
          muted={!modActive.deficiencies}
          locked={user.role !== 'SUPER_ADMIN' && !canAccess('deficiencies.view', user.role as Role, cycle.status)}
          lockedHint={user.role === 'ORG_ADMIN' ? '矯正執行階段開放填報' : '缺失發布後開放'}
        />
      </section>

      {/* 用印報告(矯正執行中之後顯示;委員不參與用印掃描檔):可見性由 access-policy 單一政策決定 */}
      {canAccess('signedReport.section', user.role as Role, cycle.status) && (
        <section id="signed-report" className="mb-6 scroll-mt-20">
          <SignedReportPanel
            cycleId={cycle.id}
            role={user.role}
            locked={cycle.status === 'CLOSED' || cycle.signedReports.some((r) => r.confirmedAt)}
          />
        </section>
      )}

      {/* 匯出:委員不需匯出功能(僅於系統內檢視機關填報的矯正措施);僅機關/中心顯示 */}
      {user.role !== 'AUDITOR' && (
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
          {/* 機關下載自家遞交版、中心下載工作底稿(整張匯出卡已對委員隱藏) */}
          {cycle.checklistSubmittedAt ? (
            <a href={`/api/cycles/${cycle.id}/export/checklist?format=docx`}>
              <Button variant="tonal" size="sm" leadingIcon={<FileText size={15} />}>Word 檢核表(遞交版)</Button>
            </a>
          ) : (
            <span title="檢核表送出後才能匯出遞交版">
              <Button variant="tonal" size="sm" disabled leadingIcon={<FileText size={15} />}>Word 檢核表(遞交版)</Button>
            </span>
          )}
          {/* 工作底稿僅中心(稽核方內部)使用;委員不下載、機關不顯示 */}
          {user.role === 'SUPER_ADMIN' && (
            <a href={`/api/cycles/${cycle.id}/export/checklist`}>
              <Button variant="text" size="sm">Excel 檢核表(工作底稿)</Button>
            </a>
          )}
        </div>
      </Card>
      )}

      {/* SUPER_ADMIN:委員指派(精靈「指派稽核委員」項目的跳轉錨點) */}
      {user.role === 'SUPER_ADMIN' && (
        <div id="assign-auditors" className="scroll-mt-24">
          <AssignAuditorsPanel cycleId={cycle.id} canAssign={canAssignAuditors(cycle.status as CycleStatus)} />
        </div>
      )}

      {/* SUPER_ADMIN:管理動作(主行動橫幅的 #management 錨點目標) */}
      {user.role === 'SUPER_ADMIN' && (
        <Card id="management" className="mb-6 scroll-mt-24">
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
  muted,
  locked,
  lockedHint,
}: {
  icon: React.ReactNode;
  tone: 'primary' | 'sage' | 'neutral';
  title: string;
  desc: string;
  href: string;
  /** 右上角狀態徽章(進度一目了然);無進度可省略 */
  badge?: React.ReactNode;
  /** 非當前階段的入口降權(淡化但仍可點),讓「現在該做的」那張最突出 */
  muted?: boolean;
  /** 鎖定:不可點(如委員於資料齊備前不可看機關檢核表),改顯示提示而非連結 */
  locked?: boolean;
  lockedHint?: string;
}) {
  // 降權改用「色彩弱化」而非整塊半透明:文字維持全對比(無障礙),非當前階段只把圖示轉中性、卡底略沉
  const iconBg = muted || locked
    ? 'bg-surface-container-high text-on-surface-variant'
    : toneClasses(tone).iconBg;

  const inner = (
    <Card interactive={!locked} className={`h-full ${muted || locked ? 'bg-surface-container-low' : ''}`}>
      <div className="flex items-start gap-4">
        <div className={`w-11 h-11 rounded-lg ${iconBg} flex items-center justify-center shrink-0`}>
          {icon}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <div className="text-title-md text-on-surface">{title}</div>
            {badge && <div className="shrink-0">{badge}</div>}
          </div>
          <p className="mt-1.5 text-body-sm text-on-surface-variant leading-relaxed">{desc}</p>
          {locked && lockedHint && (
            <p className="mt-1.5 text-caption text-on-surface-variant">🔒 {lockedHint}</p>
          )}
        </div>
      </div>
    </Card>
  );

  if (locked) {
    return <div className="block h-full cursor-not-allowed" aria-disabled>{inner}</div>;
  }
  return (
    <Link href={href} className="block h-full focus-ring rounded-lg">
      {inner}
    </Link>
  );
}
