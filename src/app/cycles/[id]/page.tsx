import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { prisma } from '@/lib/db';
import { auth } from '@/lib/auth';
import { AppShell } from '@/components/shell/AppShell';
import { Card, CardTitle, CardDescription } from '@/components/ui/Card';
import { Chip } from '@/components/ui/Chip';
import { Button } from '@/components/ui/Button';
import { CYCLE_STATUS_LABELS, cycleStatusTone, nextStatuses, rollbackTargets } from '@/lib/state-machine';
import { toneClasses, canAssignAuditors } from '@/lib/stage';
import { parseAssignDimensions, ASSIGN_ASPECT_LABELS } from '@/lib/audit-score';
import { deriveCycleFacts, nextActionForRole } from '@/lib/process-guide';
import { StageFlowRail } from '@/components/dashboard/StageFlowRail';
import { fmtROC, fmtROCDateTime } from '@/lib/date';
import { loadJourney, toClientStages } from '@/lib/journey';
import type { JourneyClientItem } from '@/components/journey/JourneyChecklist';
import { auditorCanViewChecklistContent, auditorCanScore, auditorCanSeeCycle, auditorReviewWindowState, onsiteStageEnded, CYCLE_STATUSES, DEFICIENCY_ASPECT_LABELS, ROLE_LABELS, ROLE_TONE, type CycleStatus, type Role, type DeficiencyAspect } from '@/lib/types';
import { canAccess } from '@/lib/access-policy';
import { AlertTriangle, ClipboardCheck, Eye, FileText, CheckCircle, ChevronRight, Check, Bell, History } from '@/components/icons';
import NotifyButton from './NotifyButton';
import NotifyOrgButton from './NotifyOrgButton';
import TransitionButton from './TransitionButton';
import AssignAuditorsPanel from './AssignAuditorsPanel';
import SignedReportPanel from './SignedReportPanel';
import EditCycleDialog from './EditCycleDialog';
import JourneyTodoToggle from './JourneyTodoToggle';
import DeleteCycleButton from '@/components/cycle/DeleteCycleButton';
import { TileIcon, statusToneText } from '@/components/cycle/tile';
import { DocumentProgressRail } from '@/components/cycle/DocumentProgressRail';
import { deriveDocumentChapters } from '@/lib/document-progress';

// 最近活動:僅白名單動作轉中文顯示,未列者略過(避免顯示內部代碼或雜訊)
const ACTIVITY_LABELS: Record<string, string> = {
  CYCLE_TRANSITION: '推進了週期階段',
  CYCLE_ROLLBACK: '回退了週期階段',
  PREP_SUBMIT: '繳交了稽核前資料',
  CYCLE_UPDATE: '更新了週期設定',
  CYCLE_NOTIFY_ORG_ADMINS: '通知機關填報矯正',
  CYCLE_NOTIFY_OPENED: '通知機關稽核作業開立',
  CYCLE_NOTIFY_COMMITTEE_REVIEW: '通知委員開始審閱',
  'audit.findings.convert': '彙整稽核發現為缺失',
  'audit.finish': '完成年度稽核、發布缺失',
  AUDITOR_ASSIGN: '指派了稽核委員',
  AUDITOR_UNASSIGN: '移除了委員指派',
  'audit.score.lock': '確認填寫完畢並鎖定評分',
  'audit.score.unlock': '解除了評分鎖定',
  'audit.score.return': '退回了委員評分',
  CHECKLIST_REVIEW_DONE: '完成了檢核表審閱意見',
  DEFICIENCY_CREATE: '新增了缺失',
  DEFICIENCY_IMPORT: '匯入了缺失',
  ACTION_SUBMIT: '送出了矯正措施',
  SIGNED_REPORT_UPLOAD: '上傳了用印掃描檔',
  SIGNED_REPORT_SUBMIT: '確認繳交用印掃描檔',
  SIGNED_REPORT_CONFIRM: '確認了用印掃描檔',
  SIGNED_REPORT_RETURN: '退回了用印掃描檔',
};

export default async function CyclePage({ params, searchParams }: { params: { id: string }; searchParams: { stage?: string } }) {
  const session = await auth();
  if (!session) redirect(`/login?callbackUrl=/cycles/${params.id}`);
  const user = session.user;

  const cycle = await prisma.auditCycle.findUnique({
    where: { id: params.id },
    include: {
      organization: true,
      assignments: { include: { auditor: { select: { name: true } } } },
      deficiencies: { select: { id: true, aspect: true, reviewerAuditorId: true, action: { select: { id: true, status: true } } } },
      prepRequirements: { include: { submission: { select: { status: true } } } },
      signedReports: { select: { id: true, submittedAt: true, confirmedAt: true } },
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

  // 委員只見「指派給本人審閱」的缺失(UAT 批66:狀態卡/構面矯正進度/快捷統計皆以此為基準,不看其他委員的缺失);
  // 中心/機關看全部。與缺失清單頁 myDeficiencies 同規則(reviewerAuditorId===本人)。
  const myDeficiencies =
    user.role === 'AUDITOR'
      ? cycle.deficiencies.filter((d) => d.reviewerAuditorId === user.id)
      : cycle.deficiencies;

  const total = myDeficiencies.length;
  const byStatus = (s: string) => myDeficiencies.filter((d) => d.action?.status === s).length;
  const passed = byStatus('PASSED');
  const submitted = byStatus('SUBMITTED');
  const returned = byStatus('RETURNED');
  const pendingCount = total - passed - submitted - returned ? total - passed - submitted - returned : 0;

  // 構面數據資訊:各稽核構面(策略/管理/技術)的缺失矯正通過進度(逐構面 passed/total;委員限本人審閱範圍)
  const ASPECTS: DeficiencyAspect[] = ['STRATEGY', 'MANAGEMENT', 'TECHNICAL'];
  const aspectProgress = ASPECTS.map((asp) => {
    const items = myDeficiencies.filter((d) => d.aspect === asp);
    return { asp, passed: items.filter((d) => d.action?.status === 'PASSED').length, total: items.length };
  });

  const transitions = nextStatuses(cycle.status as CycleStatus, user.role as Role);
  const rollbacks = rollbackTargets(cycle.status as CycleStatus, user.role as Role);
  const yearROC = cycle.year - 1911;

  // 「資料齊備」推進前置(UX 提示層;transition API 為權威閘):必要資料全確認 + 檢核表已送出
  const readyBlockers: string[] = [];
  if (cycle.status === 'PREPARATION') {
    const reqNotConfirmed = cycle.prepRequirements.filter(
      (r) => r.required && r.submission?.status !== 'CONFIRMED',
    ).length;
    if (reqNotConfirmed > 0) readyBlockers.push(`${reqNotConfirmed} 份必要資料未確認齊備`);
    if (!cycle.checklistSubmittedAt) readyBlockers.push('檢核表尚未送出');
  }

  // 流程位置與角色化下一步(與 dashboard 共用 process-guide)
  const facts = deriveCycleFacts(cycle, undefined, user.role === 'AUDITOR' ? user.id : undefined);
  const next = nextActionForRole(user.role, facts);

  // 委員審閱時間區間(UAT 批67):不在窗口內(或未設)→ 資料準備/檢核表卡對委員鎖定+提示原因
  const reviewState = user.role === 'AUDITOR' ? auditorReviewWindowState(cycle.reviewWindowStart, cycle.reviewWindowEnd) : 'open';
  const reviewLocked = reviewState !== 'open';
  // 實地稽核已結束(缺失發布起):改顯「實地稽核階段已結束,非審閱時段」——此時再提「未設定」不合情境(UAT 批69)
  const reviewLockHint = onsiteStageEnded(cycle.status)
    ? '實地稽核階段已結束,非審閱時段'
    : reviewState === 'before' ? '委員審閱時段尚未開始' : reviewState === 'after' ? '委員審閱時段已結束' : '中心尚未設定委員審閱時段';

  // 階段聚焦:只有「當前階段相關」的入口維持高亮,其餘降權(仍可點),讓現在該做的最突出
  const stForMod = cycle.status as CycleStatus;
  const modActive = {
    prep: stForMod === 'DRAFT' || stForMod === 'PREPARATION',
    checklist: stForMod === 'PREPARATION' || stForMod === 'ONSITE',
    audit: stForMod === 'ONSITE',
    review: stForMod === 'ONSITE',
    deficiencies: stForMod === 'REPORT_ISSUED' || stForMod === 'REMEDIATION' || stForMod === 'CLOSED',
  };
  // 建議下一步:連結若指回本頁(多為「推進狀態」),SUPER 導向頁內管理動作區;其餘角色退為純文字
  const selfHref = `/cycles/${cycle.id}`;
  const bannerNext =
    next && next.href === selfHref
      ? user.role === 'SUPER_ADMIN'
        ? { ...next, href: `${selfHref}#management`, cta: next.cta ?? '前往處理' }
        : { ...next, href: undefined, cta: undefined }
      : next;

  // 模組卡狀態:機關只看自己負責的機關區(技術檢測/實地稽核),扣除中心匯入區;中心/委員看全部
  const prepTotal = user.role === 'ORG_ADMIN' ? facts.mechTotal : cycle.prepRequirements.length;
  const prepConfirmed = user.role === 'ORG_ADMIN'
    ? facts.mechConfirmed
    : cycle.prepRequirements.filter((r) => r.submission?.status === 'CONFIRMED').length;
  const prepInsufficient = user.role === 'ORG_ADMIN' ? facts.mechInsufficient : facts.prepInsufficient;
  const prepDraft = user.role === 'ORG_ADMIN' ? facts.mechDraft : facts.prepDraft;
  const prepRemaining = user.role === 'ORG_ADMIN' ? facts.mechRemaining : facts.prepRemaining;
  const onsitePast = stForMod === 'REPORT_ISSUED' || stForMod === 'REMEDIATION' || stForMod === 'CLOSED';
  const prepDone = prepTotal > 0 && prepConfirmed === prepTotal;
  const prepStatus = prepTotal > 0 ? `${prepConfirmed}/${prepTotal}` : '—';
  const prepCaption = prepTotal > 0
    ? (prepDone ? '資料齊備' : `待繳 ${prepDraft} · 退補 ${prepInsufficient}`)
    : '尚無資料需求';
  const checklistSubmitted = Boolean(cycle.checklistSubmittedAt);
  const checklistStatus = checklistSubmitted
    ? '已送出'
    : (facts.checklistTotal > 0 ? `${facts.checklistAnswered}/${facts.checklistTotal}` : '—');
  const checklistCaption = checklistSubmitted
    ? '線上填報完成'
    : (facts.checklistTotal > 0 ? '逐題填報中' : '待中心開放填報');
  const auditStatus = onsitePast ? '已完成' : (stForMod === 'ONSITE' ? '進行中' : '尚未開始');
  const reviewStatus = onsitePast ? '已完成' : (modActive.review ? '進行中' : '待開放');
  const defStatus = total > 0 ? `${passed}/${total}` : '尚未發布';
  const defCaption = total > 0 ? `待填 ${pendingCount} · 退回 ${returned}` : '缺失發布後開放填報';

  // 委員評分完成度(快捷統計 + 系統提醒用;scoreLockedAt 已由 include 帶回)
  const committeeTotal = cycle.assignments.length;
  const committeeScored = cycle.assignments.filter((a) => a.scoreLockedAt).length;

  // 七章文件進度尺(W2,機關視角):由 lib/document-progress 單一 SoT 派生,取代散落的 StatusTile。
  // 技術檢測 = TECH;實地稽核 = 其餘機關區(非 CENTER 且非 TECH)——兩章聯集 === mechTotal 的非 CENTER 宇集,
  // 避免非典型 category 字串(category 為自由字串)落在 mechTotal 卻從兩章雙雙漏計而低報。
  const prepCounts = (pred: (cat: string) => boolean) => {
    const reqs = cycle.prepRequirements.filter((r) => pred(r.category));
    return { confirmed: reqs.filter((r) => r.submission?.status === 'CONFIRMED').length, total: reqs.length };
  };
  const docChapters =
    user.role === 'ORG_ADMIN'
      ? deriveDocumentChapters({
          cycleId: cycle.id,
          status: cycle.status as CycleStatus,
          prepTech: prepCounts((c) => c === 'TECH'),
          prepOnsite: prepCounts((c) => c !== 'CENTER' && c !== 'TECH'),
          checklist: { answered: facts.checklistAnswered, total: facts.checklistTotal, submitted: checklistSubmitted },
          deficiency: { passed, total },
          report: {
            submitted: cycle.signedReports.some((r) => r.submittedAt),
            confirmed: cycle.signedReports.some((r) => r.confirmedAt),
          },
        })
      : null;

  // 矯正截止天數(本地日界,與追蹤信一致)
  const dueDay = cycle.dueDate ? new Date(cycle.dueDate) : null;
  dueDay?.setHours(0, 0, 0, 0);
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const daysToDue = dueDay ? Math.round((dueDay.getTime() - today.getTime()) / 86400000) : 0;

  // 系統提醒(右欄):由當前階段 + 既有資料衍生的待辦訊號(角色相關)
  const alerts: { tone: 'danger' | 'warning' | 'info' | 'success'; title: string; desc: string }[] = [];
  // 機關完成時刻:全數缺失矯正通過 → 明確的成功訊號 + 下一步(用印上傳)
  if (user.role === 'ORG_ADMIN' && stForMod === 'REMEDIATION' && facts.allPassed && total > 0) {
    alerts.push({ tone: 'success', title: '全數缺失矯正通過!', desc: '請列印改善報告、機關用印後,於「用印報告」上傳並確認繳交。' });
  }
  if (user.role !== 'AUDITOR' && stForMod === 'PREPARATION' && prepInsufficient + prepRemaining > 0) {
    alerts.push({ tone: 'warning', title: `${prepInsufficient + prepRemaining} 項稽核前資料待補`, desc: '尚有退補或未繳交項目,建議提醒機關。' });
  }
  if (user.role === 'SUPER_ADMIN' && (stForMod === 'ONSITE' || stForMod === 'REPORT_ISSUED') && committeeTotal > 0 && committeeScored < committeeTotal) {
    alerts.push({ tone: 'danger', title: `${committeeTotal - committeeScored} 位委員尚未完成評分`, desc: '影響後續報告產出,建議催辦。' });
  }
  // 委員審閱時段尚未設定:已指派委員但中心未設審閱區間 → 委員被鎖在門外無法檢視機關資料審閱。
  // 於「資料齊備 / 實地稽核」相關階段提醒中心設定(對應委員自救按鈕 R2;此為中心端主動提醒)。
  if (
    user.role === 'SUPER_ADMIN' &&
    committeeTotal > 0 &&
    (stForMod === 'READY' || stForMod === 'ONSITE') &&
    (!cycle.reviewWindowStart || !cycle.reviewWindowEnd)
  ) {
    alerts.push({ tone: 'warning', title: '委員審閱時段尚未設定', desc: '委員暫無法檢視機關資料審閱;請於「稽核前資料準備」頁設定審閱起訖。' });
  }
  if (user.role === 'SUPER_ADMIN' && !cycle.dueDate && (stForMod === 'ONSITE' || stForMod === 'REPORT_ISSUED' || stForMod === 'REMEDIATION')) {
    alerts.push({ tone: 'warning', title: '矯正截止日尚未設定', desc: '發布缺失前請先於「編輯日曆」設定日期。' });
  }
  if (user.role !== 'AUDITOR' && stForMod === 'REMEDIATION' && !facts.allPassed && cycle.dueDate) {
    if (facts.overdue) alerts.push({ tone: 'danger', title: `矯正已逾期 ${Math.abs(daysToDue)} 天`, desc: '請儘速完成或督促機關改善。' });
    else if (daysToDue <= 14) alerts.push({ tone: 'warning', title: `距矯正截止剩 ${daysToDue} 天`, desc: '請留意改善進度。' });
  }
  const shownAlerts = alerts.slice(0, 3);

  // 快捷統計(右欄):挑當前階段最相關的 2–3 個讀數
  const quickStats: { label: string; value: string; tone?: 'success' | 'warning' }[] = [];
  if (prepTotal > 0) quickStats.push({ label: '資料完成度', value: `${prepConfirmed}/${prepTotal}`, tone: prepDone ? 'success' : undefined });
  if (committeeTotal > 0) quickStats.push({ label: '委員評分', value: `${committeeScored}/${committeeTotal}`, tone: committeeScored === committeeTotal ? 'success' : undefined });
  if (total > 0) quickStats.push({ label: '缺失通過', value: `${passed}/${total}`, tone: passed === total ? 'success' : undefined });

  // 引導式精靈(本週期各階段 checklist):中心看全部、機關/委員看自己角色 + 全體項。
  const orgNotified = (await prisma.emailLog.count({
    where: { relatedCycleId: cycle.id, kind: 'cycle-notify', context: { contains: '"phase":"cycle-opened"' } },
  })) > 0;
  const centerDataReleased = cycle.prepRequirements
    .filter((r) => r.category === 'CENTER')
    .every((r) => r.submission?.status === 'CONFIRMED');
  const journeyRole = user.role === 'SUPER_ADMIN' ? undefined : (user.role as Role);
  const journeyView = await loadJourney({
    scope: 'CYCLE',
    cycleId: cycle.id,
    role: journeyRole,
    autoCtx: { facts, assignmentsCount: cycle.assignments.length, orgNotified, centerDataReleased },
  });
  const journeyStages = journeyView ? toClientStages(journeyView, user.role as Role) : [];
  const donePct = journeyView && journeyView.total > 0 ? Math.round((journeyView.doneCount / journeyView.total) * 100) : 0;
  // 進度條的自訂階段(批62):範本中非七狀態的階段依排序插入流程帶——
  // 不參與狀態機(週期不會「處於」自訂階段),以該階段待辦完成度打勾;點擊看該階段待辦。
  const statusKeySet = new Set<string>(CYCLE_STATUSES);
  const customRail: { key: string; title: string; afterKey: CycleStatus | null; done: boolean }[] = [];
  {
    let lastStatus: CycleStatus | null = null;
    for (const s of journeyStages) {
      if (statusKeySet.has(s.stageKey)) { lastStatus = s.stageKey as CycleStatus; continue; }
      const countable = s.items.filter((it) => !it.informational);
      customRail.push({
        key: s.stageKey,
        title: s.title,
        afterKey: lastStatus,
        done: countable.length > 0 && countable.every((it) => it.done),
      });
    }
  }

  // 階段待辦:預設當前階段;點橫向階段列(?stage=KEY)看該階段;?stage=all 看全部階段進度
  const stageParam = typeof searchParams?.stage === 'string' ? searchParams.stage : undefined;
  const stageKeySet = new Set(journeyStages.map((s) => s.stageKey));
  const viewAllStages = stageParam === 'all';
  const selectedStageKey = viewAllStages ? null : (stageParam && stageKeySet.has(stageParam) ? stageParam : cycle.status);
  const selectedStage = selectedStageKey ? journeyStages.find((s) => s.stageKey === selectedStageKey) : null;
  const todoItems = selectedStage?.items ?? [];

  // 待辦列渲染(選定階段 / 全部階段共用)
  const renderTodo = (it: JourneyClientItem) => {
    const content = (
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 flex-wrap">
          <p className={`text-body-sm font-medium leading-snug ${it.done ? 'text-ink-500 line-through' : 'text-ink-900'}`}>{it.title}</p>
          {/* 純提醒項標籤(對齊 JourneyChecklist;也讓輔助科技能區分提醒與任務) */}
          {it.informational && <Chip size="sm" tone="neutral">提醒</Chip>}
          {/* 中心視角:標示這項是哪個角色的工作(機關管理員/稽核委員/最高管理員;無標=全體) */}
          {user.role === 'SUPER_ADMIN' && it.role && (
            <Chip size="sm" tone={ROLE_TONE[it.role]}>{ROLE_LABELS[it.role]}</Chip>
          )}
        </div>
        {it.hint && <p className="mt-0.5 text-caption text-ink-500 leading-snug">{it.hint}</p>}
      </div>
    );
    // 必做・手動勾選項:勾選框可互動(client),文字區另行連結(避免巢狀互動元素);
    // 未到達的階段不給互動勾選框(與連結鎖定一致;後端亦擋),落到下方靜態列。
    if (it.canToggle && !it.lockedStageTitle) {
      return (
        <li key={it.id}>
          <div className="flex items-start gap-3 rounded-md border border-rule px-3.5 py-3 bg-card">
            <JourneyTodoToggle itemId={it.id} cycleId={cycle.id} done={it.done} title={it.title} />
            {it.href ? (
              <Link href={it.href} className="group flex min-w-0 flex-1 items-start gap-3 focus-ring rounded-md">
                {content}
                <ChevronRight size={16} className="mt-0.5 shrink-0 text-ink-500 transition-transform group-hover:translate-x-0.5" />
              </Link>
            ) : (
              content
            )}
          </div>
        </li>
      );
    }
    const row = (
      <div className="flex items-start gap-3 rounded-md border border-rule px-3.5 py-3 bg-card transition-colors group-hover:bg-paper-sunk">
        {it.informational ? (
          <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-rule-strong ml-1.5 mr-1.5" aria-hidden />
        ) : (
          <span
            className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md border-2 ${
              it.done ? 'border-success-600 bg-success-600 text-white' : 'border-rule-strong'
            }`}
            aria-hidden
          >
            {it.done && <Check size={12} />}
          </span>
        )}
        {content}
        {it.href && <ChevronRight size={16} className="mt-0.5 shrink-0 text-ink-500 transition-transform group-hover:translate-x-0.5" />}
      </div>
    );
    return (
      <li key={it.id}>
        {it.href
          ? <Link href={it.href} className="group block focus-ring rounded-md">{row}</Link>
          : row}
      </li>
    );
  };

  // 最近活動:本週期相關實體的稽核軌跡(白名單動作→中文);entityId 皆屬本週期,不跨租戶
  const assignmentIds = cycle.assignments.map((a) => a.id);
  // 委員的活動流限本人審閱範圍的缺失(myDeficiencies),不觸及他人缺失的軌跡
  const deficiencyIds = myDeficiencies.map((d) => d.id);
  const actionIds = myDeficiencies.map((d) => d.action?.id).filter((x): x is string => Boolean(x));
  const signedReportIds = cycle.signedReports.map((r) => r.id);
  const rawLogs = await prisma.auditLog.findMany({
    where: {
      OR: [
        { entityType: 'AuditCycle', entityId: cycle.id },
        { entityType: 'AuditorAssignment', entityId: { in: assignmentIds } },
        { entityType: 'Deficiency', entityId: { in: deficiencyIds } },
        { entityType: 'CorrectiveAction', entityId: { in: actionIds } },
        { entityType: 'SignedReport', entityId: { in: signedReportIds } },
      ],
    },
    orderBy: { createdAt: 'desc' },
    take: 40,
    include: { actor: { select: { name: true, organizationId: true } } },
  });
  // 最近活動角色範圍:中心看全部;機關只看自己機關的活動;委員只看自己的活動
  const activities = rawLogs
    .filter((l) => ACTIVITY_LABELS[l.action])
    .filter((l) => {
      if (user.role === 'AUDITOR') return l.actorId === user.id;
      if (user.role === 'ORG_ADMIN') return l.actor?.organizationId === user.organizationId;
      return true;
    })
    .slice(0, 6)
    .map((l) => ({ id: l.id, who: l.actor?.name ?? '系統', what: ACTIVITY_LABELS[l.action], at: l.createdAt }));

  const alertBox: Record<'danger' | 'warning' | 'info' | 'success', string> = {
    danger: 'bg-danger-50 border-danger-100',
    warning: 'bg-warning-50 border-warning-100',
    info: 'bg-primary-50 border-primary-100',
    success: 'bg-success-50 border-success-100',
  };

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
      <h1 className="sr-only">{yearROC} 年度資通安全稽核 · {cycle.organization.name}</h1>
      <div id="setup" className="scroll-mt-24" aria-hidden />

      {/* HERO:目前階段 + 完成度 + 橫向階段流程 */}
      <section className="mb-5 rounded-2xl border border-primary-100 bg-gradient-to-br from-card to-primary-50/40 p-6 sm:p-7">
        <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-4">
          <div className="min-w-0">
            <Chip tone={cycleStatusTone(cycle.status as CycleStatus)} size="sm" dot>
              目前階段:{CYCLE_STATUS_LABELS[cycle.status as CycleStatus]}
            </Chip>
            <h2 className="mt-2.5 text-headline text-ink-900">{yearROC} 年度資通安全稽核</h2>
            <p className="mt-1.5 text-body-sm text-ink-500 leading-relaxed">
              {cycle.organization.name}
              {cycle.techCheckDate && <> · 技術檢測 {fmtROC(cycle.techCheckDate)}</>}
              {cycle.onsiteDate && <> · 實地稽核 {fmtROC(cycle.onsiteDate)}</>}
              {' · '}
              {cycle.dueDate ? <>矯正截止 {fmtROC(cycle.dueDate)}</> : '矯正截止日尚未設定'}
              {myAssignedLabels.length > 0 && <> · 您負責構面:{myAssignedLabels.join('、')}</>}
            </p>
          </div>
          <div className="flex flex-col items-end gap-3 shrink-0">
            {user.role === 'SUPER_ADMIN' && cycle.status !== 'CLOSED' && (
              <div className="flex items-center gap-1">
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
            )}
            <div className="text-right">
              <p className="text-headline-lg font-medium leading-none text-primary-700 tabular-nums">{donePct}%</p>
              <p className="mt-1 text-caption text-ink-500">流程完成度</p>
            </div>
          </div>
        </div>

        <div className="mt-5 h-2.5 overflow-hidden rounded-full bg-paper-sunk">
          <div className="h-full rounded-full bg-primary-600 transition-all duration-700" style={{ width: `${donePct}%` }} />
        </div>

        <StageFlowRail
          status={cycle.status as CycleStatus}
          className="mt-5"
          stageHref={(s) => `/cycles/${cycle.id}?stage=${s}`}
          selectedKey={selectedStageKey ?? undefined}
          custom={customRail}
        />
      </section>

      {/* 系統建議的下一步 */}
      {bannerNext && bannerNext.text && (
        <div className="mb-6 flex flex-wrap items-center justify-between gap-4 rounded-lg border border-rule border-l-4 border-l-primary-600 bg-card px-5 py-4">
          <div className="min-w-0">
            <p className="text-caption text-ink-500">系統建議的下一步</p>
            <p className="mt-1 text-title-md font-medium text-ink-900">{bannerNext.text}</p>
          </div>
          {bannerNext.href && bannerNext.cta && (
            <Link href={bannerNext.href} className="shrink-0">
              <Button size="sm">{bannerNext.cta}</Button>
            </Link>
          )}
        </div>
      )}

      {/* 主體雙欄:左=工作內容;右=系統提醒 / 快捷統計 / 最近活動 */}
      <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_340px] lg:gap-6 lg:items-start">
        <div className="min-w-0">

          {/* 待完成事項:預設當前階段;點上方階段列切換、或「查看全部」看所有階段進度 */}
          {journeyStages.length > 0 && (
            <Card className="mb-6">
              <div className="mb-3 flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <CardTitle>{viewAllStages ? '所有階段待辦進度' : `${selectedStage?.title ?? '此階段'}待完成事項`}</CardTitle>
                  {!viewAllStages && selectedStageKey !== cycle.status && (
                    <p className="mt-0.5 text-caption text-ink-500">
                      正在檢視其他階段 · <Link href={`/cycles/${cycle.id}`} className="text-primary-700 hover:underline">回當前階段</Link>
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  {journeyView && journeyView.total > 0 && (
                    <span className="text-caption text-ink-500 tabular-nums">{journeyView.doneCount}/{journeyView.total} 完成</span>
                  )}
                  <Link
                    href={viewAllStages ? `/cycles/${cycle.id}` : `/cycles/${cycle.id}?stage=all`}
                    className="text-body-sm text-primary-700 hover:underline whitespace-nowrap"
                  >
                    {viewAllStages ? '只看當前' : '查看全部'}
                  </Link>
                </div>
              </div>

              {viewAllStages ? (
                <div className="flex flex-col gap-5">
                  {journeyStages.map((stage) => (
                    <div key={stage.id}>
                      <div className="mb-2 flex items-center gap-2">
                        <p className="text-title text-ink-900">{stage.title}</p>
                        <span className="text-caption text-ink-500 tabular-nums">
                          {/* 進度分母排除純提醒項(與卡頭 doneCount/total 同基準,否則含提醒的階段永遠到不了滿) */}
                          {stage.items.filter((it) => !it.informational && it.done).length}/{stage.items.filter((it) => !it.informational).length}
                        </span>
                        {stage.stageKey === cycle.status && <Chip tone="primary" size="sm" dot>進行中</Chip>}
                      </div>
                      {stage.items.length === 0 ? (
                        <p className="text-caption text-ink-500">(此階段無待辦項)</p>
                      ) : (
                        <ul className="flex flex-col gap-2">{stage.items.map(renderTodo)}</ul>
                      )}
                    </div>
                  ))}
                </div>
              ) : todoItems.length === 0 ? (
                <p className="text-body-sm text-ink-500">此階段目前沒有待完成事項。</p>
              ) : (
                <ul className="flex flex-col gap-2">{todoItems.map(renderTodo)}</ul>
              )}
            </Card>
          )}

          {/* ── 工作區:稽核作業(中心視角四大工作區之一;評分發現卡移入下方「委員」工作區) ── */}
          {user.role === 'SUPER_ADMIN' && <SectionLabel desc="檢核表、佐證資料、改善報告與匯出">稽核作業</SectionLabel>}

          {/* 機關:七章文件進度尺(W2,單一 SoT 派生,取代散落 StatusTile);中心/委員維持模組狀態卡 */}
          {user.role === 'ORG_ADMIN' && docChapters ? (
            <DocumentProgressRail chapters={docChapters} />
          ) : (
          <section className={`grid grid-cols-2 gap-3 mb-6 ${user.role === 'AUDITOR' ? 'xl:grid-cols-4' : 'lg:grid-cols-3'}`}>
            <StatusTile
              icon={<FileText size={18} />}
              tone="primary"
              title="稽核前資料準備"
              status={prepStatus}
              statusTone={prepDone ? 'success' : 'default'}
              caption={prepCaption}
              href={`/cycles/${cycle.id}/prep`}
              muted={!modActive.prep}
              locked={
                (user.role === 'AUDITOR' && (!auditorCanViewChecklistContent(cycle.status) || reviewLocked)) ||
                (user.role === 'ORG_ADMIN' && cycle.status === 'DRAFT')
              }
              lockedHint={
                user.role === 'ORG_ADMIN' ? '中心推進至「資料準備中」後開放填報'
                  : reviewLocked ? reviewLockHint : '資料齊備後開放委員檢視'
              }
            />
            {/* 檢核表與委員審閱整併為一張:委員→審閱頁(含檢視)、機關/中心→檢核表頁 */}
            <StatusTile
              icon={<ClipboardCheck size={18} />}
              tone="primary"
              title="資通安全檢核表"
              status={user.role === 'AUDITOR' ? reviewStatus : checklistStatus}
              statusTone={
                user.role === 'AUDITOR'
                  ? (modActive.review ? 'primary' : 'default')
                  : (checklistSubmitted ? 'success' : 'default')
              }
              caption={user.role === 'AUDITOR' ? '檢視填報、逐題留審查意見' : checklistCaption}
              href={user.role === 'AUDITOR' ? `/cycles/${cycle.id}/review` : `/cycles/${cycle.id}/checklist`}
              muted={!(user.role === 'AUDITOR' ? modActive.review : modActive.checklist)}
              locked={
                (user.role === 'AUDITOR' && (!auditorCanViewChecklistContent(cycle.status) || reviewLocked)) ||
                (user.role === 'ORG_ADMIN' && cycle.status === 'DRAFT')
              }
              lockedHint={
                user.role === 'ORG_ADMIN' ? '中心推進至「資料準備中」後開放填報'
                  : reviewLocked ? reviewLockHint : '資料齊備後開放委員審閱'
              }
            />
            {/* 委員視角留在主格;中心視角移至下方「委員」工作區(與委員指派同區) */}
            {user.role === 'AUDITOR' && (
              <StatusTile
                icon={<Eye size={18} />}
                tone="primary"
                title="實地稽核評分與發現"
                status={auditStatus}
                statusTone={stForMod === 'ONSITE' ? 'primary' : 'default'}
                caption="委員線上評分、記錄稽核發現"
                href={`/cycles/${cycle.id}/audit`}
                muted={!modActive.audit}
                locked={!auditorCanScore(cycle.status)}
                lockedHint="實地稽核階段開放"
              />
            )}
            <StatusTile
              icon={<AlertTriangle size={18} />}
              tone="primary"
              title="缺失與矯正管考"
              status={defStatus}
              statusTone={total > 0 && passed === total ? 'success' : 'default'}
              caption={defCaption}
              href={`/cycles/${cycle.id}/deficiencies`}
              muted={!modActive.deficiencies}
              locked={user.role !== 'SUPER_ADMIN' && !canAccess('deficiencies.view', user.role as Role, cycle.status)}
              lockedHint={user.role === 'ORG_ADMIN' ? '矯正執行階段開放填報' : '缺失發布後開放'}
            />
          </section>
          )}

          {/* 構面矯正進度(有缺失時顯示) */}
          {total > 0 && (
            <Card className="mb-6">
              <div className="flex items-end justify-between gap-3 mb-4">
                <div>
                  <p className="text-title-md text-ink-900">構面矯正進度</p>
                  <p className="text-body-sm text-ink-500 mt-0.5">各稽核構面的缺失矯正通過情形</p>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-headline text-ink-900 tabular-nums leading-none">{Math.round((passed / total) * 100)}%</p>
                  <p className="text-caption text-ink-500 mt-1">整體 {passed}/{total}</p>
                </div>
              </div>
              <div className="grid gap-4 sm:grid-cols-3">
                {aspectProgress.map(({ asp, passed: p, total: t }) => {
                  const pct = t > 0 ? Math.round((p / t) * 100) : 0;
                  return (
                    <div key={asp}>
                      <div className="flex justify-between items-baseline text-body-sm mb-1.5">
                        <span className="font-medium text-ink-900">{DEFICIENCY_ASPECT_LABELS[asp]}</span>
                        <span className="text-ink-500 tabular-nums">{t > 0 ? `${p}/${t}` : '—'}</span>
                      </div>
                      <div className="h-2 rounded-full bg-paper-sunk overflow-hidden">
                        <div className="h-full rounded-full bg-primary-600 transition-all duration-500" style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </Card>
          )}

          {/* ── 分組:報告與匯出(機關視角;中心視角已併入上方「稽核作業」工作區) ── */}
          {user.role === 'ORG_ADMIN' && <SectionLabel>報告與匯出</SectionLabel>}

          {/* 匯出:委員不需匯出功能;僅機關/中心顯示。
              置於「用印掃描檔」之上(UAT 批68):流程=先由此匯出改善報告→機關用印→再將用印檔掃描上傳至下方,
              報告來源在前才不會找不到要去哪列印。 */}
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
                {cycle.checklistSubmittedAt ? (
                  <a href={`/api/cycles/${cycle.id}/export/checklist?format=docx`}>
                    <Button variant="tonal" size="sm" leadingIcon={<FileText size={15} />}>Word 檢核表(遞交版)</Button>
                  </a>
                ) : (
                  <span title="檢核表送出後才能匯出遞交版">
                    <Button variant="tonal" size="sm" disabled leadingIcon={<FileText size={15} />}>Word 檢核表(遞交版)</Button>
                  </span>
                )}
                {user.role === 'SUPER_ADMIN' && (
                  <a href={`/api/cycles/${cycle.id}/export/checklist`}>
                    <Button variant="text" size="sm">Excel 檢核表(工作底稿)</Button>
                  </a>
                )}
              </div>
            </Card>
          )}

          {/* 用印報告(可見性由 access-policy 決定);置於「匯出」之後=先產報告用印、再上傳掃描檔的順序 */}
          {canAccess('signedReport.section', user.role as Role, cycle.status) && (
            <section id="signed-report" className="mb-6 scroll-mt-20">
              <SignedReportPanel
                cycleId={cycle.id}
                role={user.role}
                locked={
                  cycle.status === 'CLOSED' ||
                  cycle.signedReports.some((r) => r.submittedAt || r.confirmedAt)
                }
                closed={cycle.status === 'CLOSED'}
              />
            </section>
          )}

          {/* ── 工作區:委員(評分與發現 + 指派與構面) ── */}
          {user.role === 'SUPER_ADMIN' && (
            <>
              <SectionLabel desc="評分與發現、指派委員與分配構面">委員</SectionLabel>
              <section className="grid grid-cols-2 gap-3 mb-6 lg:grid-cols-3">
                <StatusTile
                  icon={<Eye size={18} />}
                  tone="primary"
                  title="實地稽核評分與發現"
                  status={auditStatus}
                  statusTone={stForMod === 'ONSITE' ? 'primary' : 'default'}
                  caption="委員線上評分、記錄稽核發現"
                  href={`/cycles/${cycle.id}/audit`}
                  muted={!modActive.audit}
                />
              </section>
              <div id="assign-auditors" className="scroll-mt-24">
                {/* 實地稽核進行中新增委員屬重大變動(立即取得審查權限)→ 事前確認視窗 */}
                <AssignAuditorsPanel
                  cycleId={cycle.id}
                  canAssign={canAssignAuditors(cycle.status as CycleStatus)}
                  confirmOnAssign={cycle.status === 'ONSITE'}
                />
              </div>
            </>
          )}

          {/* ── 工作區:設定管理(日期、階段推進與狀態控制;通知模板/權限等全站設定在管理選單,不在本頁重複) ── */}
          {user.role === 'SUPER_ADMIN' && <SectionLabel desc="日期、階段推進與狀態控制">設定管理</SectionLabel>}

          {/* SUPER_ADMIN:管理動作 */}
          {user.role === 'SUPER_ADMIN' && (
            <Card id="management" className="mb-6 scroll-mt-24">
              <CardTitle>管理動作</CardTitle>
              <CardDescription>通知機關管理員、推進週期狀態</CardDescription>
              <div className="mt-4 flex flex-wrap items-center gap-2">
                {(cycle.status === 'REPORT_ISSUED' || cycle.status === 'REMEDIATION') && (
                  <NotifyButton cycleId={cycle.id} />
                )}
                {transitions.map((t) => (
                  <TransitionButton
                    key={t}
                    cycleId={cycle.id}
                    target={t}
                    disabled={t === 'READY' && readyBlockers.length > 0}
                    disabledHint={t === 'READY' && readyBlockers.length > 0 ? `尚未齊備:${readyBlockers.join('、')}` : undefined}
                    // 推進到「缺失發布/矯正執行」前若未設矯正截止日→確認框軟性提醒(UAT 批68);非阻擋,可確認後續推
                    warn={
                      !cycle.dueDate && (t === 'REPORT_ISSUED' || t === 'REMEDIATION')
                        ? '缺失發布後機關須依此日期填報矯正措施。建議先按右上「編輯日期」設定矯正截止日;如稍後再設,可確認後繼續推進。'
                        : undefined
                    }
                  />
                ))}
                {rollbacks.length > 0 && <span className="w-px h-5 bg-rule-strong mx-1" aria-hidden />}
                {rollbacks.map((t) => (
                  <TransitionButton key={`rb-${t}`} cycleId={cycle.id} target={t} rollback />
                ))}
                {/* 刪除週期:僅開立中(建錯醫院/年度時);推進後不可刪(後端亦擋) */}
                {cycle.status === 'DRAFT' && (
                  <>
                    <span className="w-px h-5 bg-rule-strong mx-1" aria-hidden />
                    <DeleteCycleButton
                      cycleId={cycle.id}
                      orgName={cycle.organization.shortName ?? cycle.organization.name}
                      yearROC={yearROC}
                      redirectTo="/admin/cycles"
                    />
                  </>
                )}
              </div>
            </Card>
          )}
        </div>

        {/* 右欄:系統提醒 / 快捷統計 / 最近活動 */}
        <aside className="mt-2 lg:mt-0 lg:sticky lg:top-6 flex flex-col gap-4">
          {/* 系統提醒 */}
          <div className="rounded-lg border border-rule bg-card p-4">
            <div className="mb-3 flex items-center gap-2">
              <Bell size={16} className="text-ink-500" />
              <h3 className="text-title font-medium text-ink-900">系統提醒</h3>
            </div>
            {shownAlerts.length === 0 ? (
              <p className="text-body-sm text-ink-500">目前無待處理提醒。</p>
            ) : (
              <div className="flex flex-col gap-2">
                {shownAlerts.map((a, i) => (
                  <div key={i} className={`rounded-md border px-3.5 py-2.5 ${alertBox[a.tone]}`}>
                    <p className="text-body-sm font-medium text-ink-900">{a.title}</p>
                    <p className="mt-0.5 text-caption text-ink-500">{a.desc}</p>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* 快捷統計 */}
          {quickStats.length > 0 && (
            <div className="rounded-lg border border-rule bg-card p-4">
              <h3 className="mb-3 text-title-sm font-medium text-ink-900">快捷統計</h3>
              <div className="grid grid-cols-2 gap-2">
                {quickStats.map((s) => (
                  <div key={s.label} className="rounded-md bg-paper-sunk px-3 py-2.5">
                    <p className="text-caption text-ink-500">{s.label}</p>
                    <p className={`mt-1 text-title-md font-medium tabular-nums ${s.tone === 'success' ? 'text-success-700' : 'text-ink-900'}`}>{s.value}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 最近活動(稽核軌跡) */}
          <div className="rounded-lg border border-rule bg-card p-4">
            <div className="mb-3 flex items-center gap-2">
              <History size={16} className="text-ink-500" />
              <h3 className="text-title font-medium text-ink-900">最近活動</h3>
            </div>
            {activities.length === 0 ? (
              <p className="text-body-sm text-ink-500">尚無活動紀錄。</p>
            ) : (
              <ul className="flex flex-col gap-3">
                {activities.map((a) => (
                  <li key={a.id} className="flex gap-2.5">
                    <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary-500" aria-hidden />
                    <div className="min-w-0">
                      <p className="text-body-sm text-ink-900 leading-snug">
                        <span className="font-medium">{a.who}</span> {a.what}
                      </p>
                      <p className="mt-0.5 text-caption text-ink-500">{fmtROCDateTime(a.at)}</p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </aside>
      </div>
    </AppShell>
  );
}

/** 週期頁下半部的工作區小標(中心視角:稽核作業 / 委員 / 設定管理;機關視角:報告與匯出),不改功能只加結構 */
function SectionLabel({ children, desc }: { children: React.ReactNode; desc?: string }) {
  return (
    <div className="mt-3 mb-3 flex items-center gap-3">
      <h2 className="text-label-sm font-medium uppercase tracking-[0.08em] text-ink-500 whitespace-nowrap">{children}</h2>
      {desc && <span className="hidden sm:inline text-caption text-ink-500 whitespace-nowrap">{desc}</span>}
      <span className="h-px flex-1 bg-rule" aria-hidden />
    </div>
  );
}

function StatusTile({
  icon,
  tone,
  title,
  status,
  statusTone = 'default',
  caption,
  href,
  muted,
  locked,
  lockedHint,
}: {
  icon: React.ReactNode;
  tone: 'primary' | 'sage' | 'neutral';
  title: string;
  /** 精簡卡的主狀態值(如 20/20、已送出、進行中、待處理) */
  status: string;
  /** 狀態值配色:done→綠、需注意→琥珀、當前→主色、其餘→中性 */
  statusTone?: 'default' | 'success' | 'warning' | 'primary';
  /** 一句話補充(退補/待繳、線上填報完成…) */
  caption?: string;
  href: string;
  /** 非當前階段的入口降權(淡化但仍可點),讓「現在該做的」那張最突出 */
  muted?: boolean;
  /** 鎖定:不可點(如委員於資料齊備前不可看機關檢核表),改顯示提示而非連結 */
  locked?: boolean;
  lockedHint?: string;
}) {
  const iconBg = muted || locked
    ? 'bg-paper-sunk text-ink-500'
    : toneClasses(tone).iconBg;
  const statusColor = locked ? 'text-ink-500' : statusToneText[statusTone];

  const inner = (
    <Card interactive={!locked} className={`h-full ${muted || locked ? 'bg-paper-sunk' : ''}`}>
      <div className="flex items-center gap-2.5">
        <TileIcon className={iconBg}>{icon}</TileIcon>
        <p className="min-w-0 flex-1 text-body-sm font-medium text-ink-900 leading-tight">{title}</p>
        {!locked && <ChevronRight size={16} className="shrink-0 text-ink-500 transition-transform group-hover:translate-x-0.5" />}
      </div>
      {locked ? (
        <p className="mt-3 text-body-sm text-ink-500">🔒 {lockedHint}</p>
      ) : (
        <>
          {/* n/N 型狀態:大數字 + 小單位分排(排印精緻化);其餘照原樣 */}
          {(() => {
            const m = status.match(/^(\d+)\/(\d+)$/);
            return (
              <p className={`mt-3 text-title-md font-medium tabular-nums leading-none ${statusColor}`}>
                {m ? (
                  <>
                    {m[1]}
                    <span className="text-caption font-normal text-ink-500"> /{m[2]}</span>
                  </>
                ) : (
                  status
                )}
              </p>
            );
          })()}
          {caption && <p className="mt-1.5 text-caption text-ink-500 leading-tight">{caption}</p>}
        </>
      )}
    </Card>
  );

  if (locked) {
    return <div className="block h-full cursor-not-allowed" aria-disabled>{inner}</div>;
  }
  return (
    <Link href={href} className="group block h-full focus-ring rounded-lg">
      {inner}
    </Link>
  );
}
