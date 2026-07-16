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
import { auditorCanSeeCycle, reviewWindowStateForRole, CYCLE_STATUSES, DEFICIENCY_ASPECT_LABELS, ROLE_LABELS, ROLE_TONE, type CycleStatus, type Role, type DeficiencyAspect } from '@/lib/types';
import { canAccess } from '@/lib/access-policy';
import { buildModuleNav } from '@/lib/cycle-modules';
import { getCycleActivities } from '@/lib/cycle-activity';
import { Menu } from '@/components/ui/Menu';
import { AlertTriangle, ClipboardCheck, Eye, FileText, CheckCircle, ChevronRight, Check, Bell, History, Settings } from '@/components/icons';
import NotifyOrgButton from './NotifyOrgButton';
import RefreshOnFocus from '@/components/cycle/RefreshOnFocus';
import TransitionButton from './TransitionButton';
import SignedReportPanel from './SignedReportPanel';
import EditCycleDialog from './EditCycleDialog';
import JourneyTodoToggle from './JourneyTodoToggle';
import RemindButton from '@/components/cycle/RemindButton';
import { TileIcon, statusToneText } from '@/components/cycle/tile';

// 四模組卡圖示(key 對齊 lib/cycle-modules 的 ModuleKey)
const MODULE_ICONS: Record<string, React.ReactNode> = {
  prep: <FileText size={18} />,
  checklist: <ClipboardCheck size={18} />,
  settings: <Settings size={18} />,
  audit: <Eye size={18} />,
  def: <AlertTriangle size={18} />,
  report: <CheckCircle size={18} />,
  practice: <ClipboardCheck size={18} />,
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
  // 觀察員(批30):未配對 → 導回;開立中亦不可見(配對查 CycleObserver,絕不與委員指派混表)
  // mentorId 留給「最近活動」收斂範圍用:觀察員只看自己 + 配對指導委員的活動
  let observerMentorId: string | null = null;
  if (user.role === 'OBSERVER') {
    const paired = await prisma.cycleObserver.findUnique({
      where: { cycleId_observerId: { cycleId: cycle.id, observerId: user.id } },
      select: { mentorId: true },
    });
    if (!paired || !auditorCanSeeCycle(cycle.status)) redirect('/dashboard');
    observerMentorId = paired.mentorId;
  }
  // 未列舉角色預設拒絕(批30 雷區:新角色落過上列 if 即 fail-open 繼承中心視野)
  if (!['SUPER_ADMIN', 'ORG_ADMIN', 'AUDITOR', 'OBSERVER'].includes(user.role)) redirect('/dashboard');
  // 師徒制(批30):委員視角帶「本人指導的觀察員數」(>0 顯示「指導觀察員」入口卡)
  const mentorObservers = user.role === 'AUDITOR'
    ? await prisma.cycleObserver.count({ where: { cycleId: cycle.id, mentorId: user.id } })
    : 0;

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

  // 委員/觀察員審閱時間區間(UAT 批67;觀察員批30 獨立窗口):不在窗口內(或未設)→ 資料準備/審閱卡鎖定+提示原因
  const reviewState = reviewWindowStateForRole(user.role as Role, cycle);

  // 下一步 CTA(頂部卡右側):
  //  中心=推進類(href 指回本頁)由頂部推進鈕群承擔不重複;但「跨頁捷徑」型下一步(去發布/去追蹤/寄提醒
  //  等非狀態轉換動作)仍保留 CTA,否則中心失去原橫幅的一鍵入口(審查鏡4)。
  //  機關/委員=照舊;連結指回本頁時退為純文字。
  const selfHref = `/cycles/${cycle.id}`;
  const bannerNext = user.role === 'SUPER_ADMIN'
    // 跨頁捷徑型(href≠本頁)或一鍵寄提醒型(remind,無 href)保留為橫幅 CTA;純推進型(href=本頁)交給推進鈕群
    ? (next && ((next.href && next.href !== selfHref) || next.remind) ? next : null)
    : next && next.href === selfHref ? { ...next, href: undefined, cta: undefined } : next;

  // 模組卡讀數:機關只看自己負責的機關區(技術檢測/實地稽核),扣除中心匯入區;中心/委員看全部
  const prepTotal = user.role === 'ORG_ADMIN' ? facts.mechTotal : cycle.prepRequirements.length;
  const prepConfirmed = user.role === 'ORG_ADMIN'
    ? facts.mechConfirmed
    : cycle.prepRequirements.filter((r) => r.submission?.status === 'CONFIRMED').length;
  const prepInsufficient = user.role === 'ORG_ADMIN' ? facts.mechInsufficient : facts.prepInsufficient;
  const prepDraft = user.role === 'ORG_ADMIN' ? facts.mechDraft : facts.prepDraft;
  const prepRemaining = user.role === 'ORG_ADMIN' ? facts.mechRemaining : facts.prepRemaining;
  const prepDone = prepTotal > 0 && prepConfirmed === prepTotal;
  const checklistSubmitted = Boolean(cycle.checklistSubmittedAt);

  // 委員評分完成度(快捷統計 + 系統提醒用;scoreLockedAt 已由 include 帶回)
  const committeeTotal = cycle.assignments.length;
  const committeeScored = cycle.assignments.filter((a) => a.scoreLockedAt).length;

  // 矯正截止天數(本地日界,與追蹤信一致)
  const dueDay = cycle.dueDate ? new Date(cycle.dueDate) : null;
  dueDay?.setHours(0, 0, 0, 0);
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const daysToDue = dueDay ? Math.round((dueDay.getTime() - today.getTime()) / 86400000) : 0;

  // 是否已寄發「稽核作業通知」給機關(開立中「通知機關」訊號):系統提醒(批65 N1.3)與下方引導清單共用,免重算。
  const orgNotified = (await prisma.emailLog.count({
    where: { relatedCycleId: cycle.id, kind: 'cycle-notify', context: { contains: '"phase":"cycle-opened"' } },
  })) > 0;
  // 分區繳交期限是否「已過整個到期日」(prepDueTech/prepDueDate 存為台北當日 00:00;+24h=到期日隔日 00:00,
  // 以絕對時刻比較不受伺服器時區影響;到期日當天不算逾期,隔日起才逾期)。批65 N1.4 用。
  const pastDueDay = (d: Date | null) => !!d && Date.now() >= new Date(d).getTime() + 86400000;

  // 批72:本機關「歷年缺失持續列管中」提示帶——中心/機關/本週期委員可見(觀察員不可,對齊 tracking.view;
  // 委員限非結案週期=實地稽核前調閱語境,/tracking 委員範圍亦以進行中指派週期為界)。
  const showTrackedBand =
    user.role === 'SUPER_ADMIN' || user.role === 'ORG_ADMIN' || (user.role === 'AUDITOR' && cycle.status !== 'CLOSED');
  const trackedCount = showTrackedBand
    ? await prisma.trackedDeficiency.count({ where: { organizationId: cycle.organizationId, status: 'TRACKING' } })
    : 0;

  // 系統提醒(右欄):由當前階段 + 既有資料衍生的待辦訊號(角色相關)
  const alerts: { tone: 'danger' | 'warning' | 'info' | 'success'; title: string; desc: string }[] = [];
  // (減法:原「全數缺失矯正通過!」success 提醒已刪——同一句話已由頂部「下一步」與用印卡/儀表板待辦表達,同頁三講)
  const stForMod = cycle.status as CycleStatus;
  // 機關在開立中(批36):模組全上鎖但無事可做,補一句統攝說明,避免承辦人以為系統壞了或自己漏設定
  if (user.role === 'ORG_ADMIN' && stForMod === 'DRAFT') {
    alerts.push({ tone: 'info', title: '本週期尚在中心開立設定中', desc: '您目前無需任何動作；待中心推進至「資料準備中」，系統會通知您開始上傳資料與填報檢核表。' });
  }
  // 中心開立中(批65 N1):卡關/漏設定例外警示——日期未設、需求清單未掛、日期已設但未通知機關。
  if (user.role === 'SUPER_ADMIN' && stForMod === 'DRAFT') {
    // 「必設」對齊引導清單 dates_set 規則(實地稽核日 + 實地稽核資料截止);技術檢測日/截止為選配不強制
    const datesSet = !!cycle.onsiteDate && !!cycle.prepDueDate;
    if (!datesSet)
      alerts.push({ tone: 'warning', title: '稽核日期與繳交期限尚未設定', desc: '請按「編輯日期」設定實地稽核日與文件繳交截止。' });
    if (cycle.prepRequirements.length === 0)
      alerts.push({ tone: 'warning', title: '資料準備需求清單尚未掛上', desc: '請至「稽核前資料準備」設定機關應備文件清單。' });
    if (datesSet && !orgNotified)
      alerts.push({ tone: 'info', title: '日期已設，尚未通知機關', desc: '請按「通知機關（稽核開立）」寄發作業通知與重要時程。' });
  }
  // 分區繳交期限已過但未繳齊(批65 N1.4;danger)。未繳齊=該區有 submission 非 SUBMITTED/CONFIRMED
  //（等同 facts.mech*AllSubmitted 取反;無該區項目視為已繳齊、不亮）。desc 依角色分述。
  if ((user.role === 'SUPER_ADMIN' || user.role === 'ORG_ADMIN') && stForMod === 'PREPARATION') {
    const overdueDesc = user.role === 'ORG_ADMIN' ? '已過繳交期限，請儘速上傳並繳交。' : '機關已過繳交期限，建議催繳機關。';
    if (pastDueDay(cycle.prepDueTech) && !facts.mechTechAllSubmitted)
      alerts.push({ tone: 'danger', title: '技術檢測文件已逾繳交期限', desc: overdueDesc });
    if (pastDueDay(cycle.prepDueDate) && !facts.mechOnsiteAllSubmitted)
      alerts.push({ tone: 'danger', title: '實地稽核文件已逾繳交期限', desc: overdueDesc });
  }
  if ((user.role === 'SUPER_ADMIN' || user.role === 'ORG_ADMIN') && stForMod === 'PREPARATION' && prepInsufficient + prepRemaining > 0) {
    // 批65 N2:依角色分述——機關端是「自己要繳」,對機關講「提醒機關」語意錯位(同批57 逾期分角色手法)。
    alerts.push({
      tone: 'warning',
      title: `${prepInsufficient + prepRemaining} 項稽核前資料待補`,
      desc: user.role === 'ORG_ADMIN' ? '尚有退補或未繳交項目，請儘速上傳並繳交。' : '尚有退補或未繳交項目，建議提醒機關。',
    });
  }
  if (user.role === 'SUPER_ADMIN' && (stForMod === 'ONSITE' || stForMod === 'REPORT_ISSUED') && committeeTotal > 0 && committeeScored < committeeTotal) {
    alerts.push({ tone: 'danger', title: `${committeeTotal - committeeScored} 位委員尚未完成評分`, desc: '影響後續報告產出，建議催辦。' });
  }
  // 委員審閱時段尚未設定:已指派委員但中心未設審閱區間 → 委員被鎖在門外無法檢視機關資料審閱。
  // 於「資料齊備 / 實地稽核」相關階段提醒中心設定(對應委員自救按鈕 R2;此為中心端主動提醒)。
  if (
    user.role === 'SUPER_ADMIN' &&
    committeeTotal > 0 &&
    (stForMod === 'READY' || stForMod === 'ONSITE') &&
    (!cycle.reviewWindowStart || !cycle.reviewWindowEnd)
  ) {
    alerts.push({ tone: 'warning', title: '委員審閱時段尚未設定', desc: '委員暫無法檢視機關資料審閱；請於「稽核前資料準備」頁設定審閱起訖。' });
  }
  if (user.role === 'SUPER_ADMIN' && !cycle.dueDate && (stForMod === 'ONSITE' || stForMod === 'REPORT_ISSUED' || stForMod === 'REMEDIATION')) {
    alerts.push({ tone: 'warning', title: '矯正截止日尚未設定', desc: '發布缺失前請先於「編輯日曆」設定日期。' });
  }
  if ((user.role === 'SUPER_ADMIN' || user.role === 'ORG_ADMIN') && stForMod === 'REMEDIATION' && !facts.allPassed && cycle.dueDate) {
    // 批57:逾期提醒依角色分述——機關端是「自己要完成填報」,對機關講「督促機關改善」語意錯位。
    if (facts.overdue)
      alerts.push({
        tone: 'danger',
        title: `矯正已逾期 ${Math.abs(daysToDue)} 天`,
        desc: user.role === 'ORG_ADMIN' ? '請儘速完成矯正措施填報與佐證上傳。' : '請儘速完成或督促機關改善。',
      });
    else if (daysToDue <= 14) alerts.push({ tone: 'warning', title: `距矯正截止剩 ${daysToDue} 天`, desc: '請留意改善進度。' });
  }
  // 最重要排前(逾期 danger > 未設定/待補 warning > 未通知 info),再取前三(批65:同階段可能多條;sort 穩定)
  const ALERT_RANK: Record<'danger' | 'warning' | 'info' | 'success', number> = { danger: 0, warning: 1, info: 2, success: 3 };
  const shownAlerts = [...alerts].sort((a, b) => ALERT_RANK[a.tone] - ALERT_RANK[b.tone]).slice(0, 3);

  // 快捷統計(右欄):挑當前階段最相關的 2–3 個讀數
  const quickStats: { label: string; value: string; tone?: 'success' | 'warning' }[] = [];
  if (prepTotal > 0) quickStats.push({ label: '資料完成度', value: `${prepConfirmed}/${prepTotal}`, tone: prepDone ? 'success' : undefined });
  if (committeeTotal > 0) quickStats.push({ label: '委員評分', value: `${committeeScored}/${committeeTotal}`, tone: committeeScored === committeeTotal ? 'success' : undefined });
  if (total > 0) quickStats.push({ label: '缺失通過', value: `${passed}/${total}`, tone: passed === total ? 'success' : undefined });

  // 四模組工作卡(單一來源 lib/cycle-modules;與 prep 頁左欄同吃,消除兩套平行狀態計算)
  const modules = buildModuleNav({
    cycleId: cycle.id,
    role: user.role as Role,
    status: cycle.status as CycleStatus,
    prep: { confirmed: prepConfirmed, total: prepTotal, draft: prepDraft, insufficient: prepInsufficient },
    checklist: { submitted: checklistSubmitted, answered: facts.checklistAnswered, total: facts.checklistTotal },
    def: { total, passed, pending: pendingCount, returned },
    report: {
      submitted: cycle.signedReports.some((r) => r.submittedAt),
      confirmed: cycle.signedReports.some((r) => r.confirmedAt),
    },
    auditorReviewState: user.role === 'AUDITOR' ? reviewState : undefined,
    observerReviewState: user.role === 'OBSERVER' ? reviewState : undefined,
    mentorObservers: user.role === 'AUDITOR' ? mentorObservers : undefined,
  });

  // 引導式精靈(本週期各階段 checklist):中心看全部、機關/委員看自己角色 + 全體項。
  // (orgNotified 已於上方系統提醒前算過,此處直接復用)
  const centerDataReleased = cycle.prepRequirements
    .filter((r) => r.category === 'CENTER')
    .every((r) => r.submission?.status === 'CONFIRMED');
  const journeyRole = user.role === 'SUPER_ADMIN' ? undefined : (user.role as Role);
  const observersCount = await prisma.cycleObserver.count({ where: { cycleId: cycle.id } });
  // 審閱時間區間訊號(批67 P2):委員/觀察員窗口是否已設,供「設定審閱時間區間」項自動判定完成。
  const reviewWindowSet = !!cycle.reviewWindowStart && !!cycle.reviewWindowEnd;
  const observerWindowSet = !!cycle.observerWindowStart && !!cycle.observerWindowEnd;
  const journeyView = await loadJourney({
    scope: 'CYCLE',
    cycleId: cycle.id,
    role: journeyRole,
    autoCtx: { facts, assignmentsCount: cycle.assignments.length, observersCount, orgNotified, centerDataReleased, reviewWindowSet, observerWindowSet },
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

  // 自訂「清單階段」與「下一步」同步(批49 圖1/圖4;使用者裁量:只同步提示文字,不改狀態機/推進):
  // 目前狀態後方若有「未完成」的自訂清單階段,「下一步」先導向完成該清單階段——避免提示直接跳到再下一個
  // 正式階段(如結案)的工作而略過清單階段。矯正未全數通過時不覆蓋(此時下一步應是矯正,勿蓋掉機關待辦)。
  const pendingCustomStage = customRail.find((c) => c.afterKey === cycle.status && !c.done);
  const suppressCustomHint = cycle.status === 'REMEDIATION' && !facts.allPassed;
  const effectiveNext =
    pendingCustomStage && !suppressCustomHint
      ? {
          text: `先完成「${pendingCustomStage.title}」清單階段的待辦（清單追蹤，非結案前置關卡）`,
          href: `/cycles/${cycle.id}?stage=${pendingCustomStage.key}`,
          cta: '去查看',
        }
      : bannerNext;

  // 「寄提醒」下一步(中心·全數通過待機關用印回傳):就地一鍵寄催辦信(復用 track-remind),
  // 並帶出本週期催辦軌跡(上次日期/累計封數)。僅此情境才查詢,避免每次載入多打一次 DB。
  const remindTrail = effectiveNext?.remind
    ? await prisma.emailLog.aggregate({
        where: { relatedCycleId: cycle.id, kind: 'track-remind', status: { in: ['sent', 'simulated'] } },
        _count: { _all: true },
        _max: { sentAt: true },
      })
    : null;

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

  // 最近活動(共用 lib/cycle-activity;完整清單於 /cycles/[id]/activity)。委員限本人審閱範圍缺失。
  const activities = await getCycleActivities({
    cycleId: cycle.id,
    role: user.role as Role,
    userId: user.id,
    organizationId: user.organizationId,
    mentorUserId: observerMentorId,
    assignmentIds: cycle.assignments.map((a) => a.id),
    deficiencyIds: myDeficiencies.map((d) => d.id),
    actionIds: myDeficiencies.map((d) => d.action?.id).filter((x): x is string => Boolean(x)),
    signedReportIds: cycle.signedReports.map((r) => r.id),
    limit: 6,
  });

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
      {/* 多角色協作面:切回本視窗/分頁時自動重取伺服器資料(他人勾選待辦/繳交即反映,免手動重載) */}
      <RefreshOnFocus />
      <div id="setup" className="scroll-mt-24" aria-hidden />

      {/* 頂部總覽卡(圖1 結構):標題+日期 / 可點階段 stepper / 下一步 CTA。
          原 HERO 漸層大卡+獨立進度條+獨立「系統建議下一步」橫幅併為一卡(減法);
          中心的「推進」主動作上移至此(回退/刪除/矯正通知留頁尾「進階管理」)。 */}
      <section className="mb-6 rounded-xl border border-rule bg-card p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2.5 flex-wrap">
              <h2 className="text-title-lg text-ink-900">{yearROC} 年度資通安全稽核</h2>
              <Chip tone={cycleStatusTone(cycle.status as CycleStatus)} size="sm" dot>
                {CYCLE_STATUS_LABELS[cycle.status as CycleStatus]}
              </Chip>
            </div>
            <p className="mt-1.5 text-body-sm text-ink-500 leading-relaxed">
              {cycle.organization.name}
              {cycle.techCheckDate && <> · 技術檢測 {fmtROC(cycle.techCheckDate)}</>}
              {cycle.onsiteDate && <> · 實地稽核 {fmtROC(cycle.onsiteDate)}</>}
              {' · '}
              {cycle.dueDate ? <>矯正截止 {fmtROC(cycle.dueDate)}</> : '矯正截止日尚未設定'}
              {myAssignedLabels.length > 0 && <> · 您負責構面：{myAssignedLabels.join('、')}</>}
            </p>
          </div>
          <p className="shrink-0 text-caption text-ink-500 tabular-nums">流程完成度 {donePct}%</p>
        </div>

        {/* 動作列(全寬):中心的管理捷徑靠左,「下一步」提示+CTA 靠右——
            原本掛在標題右欄,遇上推進鈕的長 disabledHint 會把整欄擠到換行、右側大片留白(UAT 圖3) */}
        {((user.role === 'SUPER_ADMIN' && cycle.status !== 'CLOSED') || bannerNext) && (
          <div className="mt-4 flex flex-wrap items-center gap-x-1.5 gap-y-2">
            {user.role === 'SUPER_ADMIN' && cycle.status !== 'CLOSED' && (
              <>
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
                {transitions.map((t) => (
                  <TransitionButton
                    key={t}
                    cycleId={cycle.id}
                    target={t}
                    disabled={t === 'READY' && readyBlockers.length > 0}
                    disabledHint={t === 'READY' && readyBlockers.length > 0 ? `尚未齊備：${readyBlockers.join('、')}` : undefined}
                    // 推進到「缺失發布/矯正執行」前若未設矯正截止日→確認框軟性提醒(UAT 批68);非阻擋,可確認後續推
                    warn={
                      !cycle.dueDate && (t === 'REPORT_ISSUED' || t === 'REMEDIATION')
                        ? '缺失發布後機關須依此日期填報矯正措施。建議先按「編輯日期」設定矯正截止日；如稍後再設，可確認後繼續推進。'
                        : undefined
                    }
                  />
                ))}
              </>
            )}
            {effectiveNext && (
              <span className="ml-auto flex items-center gap-2">
                {effectiveNext.text && (
                  <span className="text-caption text-ink-500 leading-snug">下一步：{effectiveNext.text}</span>
                )}
                {effectiveNext.remind ? (
                  <RemindButton
                    cycleId={cycle.id}
                    orgName={cycle.organization.name}
                    yearLabel={String(yearROC)}
                    lastLabel={remindTrail?._max.sentAt ? fmtROC(remindTrail._max.sentAt) : null}
                    remindCount={remindTrail?._count._all ?? 0}
                  />
                ) : effectiveNext.href && effectiveNext.cta ? (
                  <Link href={effectiveNext.href}>
                    <Button size="sm">{effectiveNext.cta}</Button>
                  </Link>
                ) : null}
              </span>
            )}
          </div>
        )}

        <StageFlowRail
          status={cycle.status as CycleStatus}
          className="mt-4 border-t border-rule pt-4"
          stageHref={(s) => `/cycles/${cycle.id}?stage=${s}`}
          selectedKey={selectedStageKey ?? undefined}
          custom={customRail}
        />
      </section>

      {/* 批72:歷年缺失持續列管提示帶(前情提要;點擊往列管庫,中心帶機關篩選) */}
      {trackedCount > 0 && (
        <Link
          href={user.role === 'SUPER_ADMIN' ? `/tracking?org=${cycle.organizationId}` : '/tracking'}
          className="group mb-6 block focus-ring rounded-md"
        >
          <div className="flex items-center gap-3 rounded-md border border-warning-100 bg-warning-50 px-4 py-3">
            <History size={18} className="shrink-0 text-warning-700" aria-hidden />
            <p className="min-w-0 flex-1 text-body-sm text-ink-900">
              本機關尚有 <span className="font-semibold tabular-nums">{trackedCount}</span> 筆歷年缺失持續列管中
              <span className="text-ink-500">
                {user.role === 'ORG_ADMIN'
                  ? '，請依回報期限提交最新改善進度。'
                  : '（跨年度滾動管考），實地稽核前可於列管庫調閱。'}
              </span>
            </p>
            <ChevronRight size={16} className="shrink-0 text-ink-500 transition-transform group-hover:translate-x-0.5" aria-hidden />
          </div>
        </Link>
      )}

      {/* 主體雙欄:左=工作內容;右=系統提醒 / 快捷統計 / 最近活動 */}
      <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_340px] lg:gap-6 lg:items-start">
        <div className="min-w-0">

          {/* 模組工作卡網格(單一來源 buildModuleNav;批26:檢核表=prep 子項不再獨立成卡,
              中心第二格=進階設定;子項(childOf)於 prep 左欄與側欄樹縮排呈現) */}
          <section className="grid grid-cols-2 gap-3 mb-6">
            {modules.filter((m) => !m.childOf).map((m) => (
              <StatusTile
                key={m.key}
                icon={MODULE_ICONS[m.key]}
                tone="primary"
                title={m.title}
                status={m.status}
                statusTone={m.statusTone}
                caption={m.caption}
                href={m.href}
                muted={m.muted}
                locked={m.locked}
                lockedHint={m.lockedHint}
              />
            ))}
          </section>

          {/* 待完成事項:預設當前階段;點上方階段列切換、或「查看全部」看所有階段進度 */}
          {journeyStages.length > 0 && (
            <Card className="mb-6">
              <div className="mb-3 flex items-start justify-between gap-3">
                <div className="min-w-0">
                  {/* 批34 圖2:自訂清單階段標題明示「清單階段待辦」,不可能誤讀為目前階段(?stage= 殘留
                      使機關把「測試待完成事項」當成目前階段=測試;真實階段以下方提示併列)。 */}
                  <CardTitle>
                    {viewAllStages
                      ? '所有階段待辦進度'
                      : selectedStageKey && !statusKeySet.has(selectedStageKey)
                        ? `「${selectedStage?.title ?? '清單'}」清單階段待辦`
                        : `${selectedStage?.title ?? '此階段'}待完成事項`}
                  </CardTitle>
                  {/* 自訂(清單)階段:明示非流程關卡、無需推進,並併列真實目前階段(兩角色一致以 cycle.status 為準) */}
                  {!viewAllStages && selectedStageKey && !statusKeySet.has(selectedStageKey) && (
                    <p className="mt-0.5 text-caption text-ink-500">
                      此為清單追蹤階段（非流程關卡），完成待辦即打勾，無需推進週期狀態；
                      目前實際階段為「{CYCLE_STATUS_LABELS[cycle.status as CycleStatus]}」。
                    </p>
                  )}
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
                        <p className="text-caption text-ink-500">（此階段無待辦項）</p>
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

          {/* (委員指派移入頁尾「進階設定」集中區,批26 裁定:設定相關的東西都放進去) */}

          {/* 匯出:委員不需匯出功能;僅機關/中心顯示。
              置於「用印掃描檔」之上(UAT 批68):流程=先由此匯出改善報告→機關用印→再將用印檔掃描上傳至下方。
              四顆平鋪鈕收斂為單一下載選單(roles#11;對齊 admin/cycles 的 Menu 模式)。 */}
          {(user.role === 'SUPER_ADMIN' || user.role === 'ORG_ADMIN') && (
            <Card className="mb-6">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <CardTitle>匯出</CardTitle>
                  <CardDescription>
                    產出制式公文格式檔案。
                    {user.role === 'ORG_ADMIN'
                      ? '「遞交版」為送主管機關之正式檔。'
                      : '「遞交版」為送主管機關正本；「工作底稿」供稽核方內部審查用。'}
                  </CardDescription>
                </div>
                <Menu
                  label="下載文件"
                  variant="tonal"
                  size="sm"
                  items={[
                    {
                      label: total > 0 ? 'Word 改善報告' : 'Word 改善報告（缺失發布後開放）',
                      href: `/api/cycles/${cycle.id}/export/remediation-report`,
                      icon: <FileText size={15} />,
                      disabled: total === 0,
                    },
                    {
                      label: total > 0 ? '列印版（瀏覽器另存 PDF）' : '列印版（缺失發布後開放）',
                      href: `/cycles/${cycle.id}/print`,
                      target: '_blank',
                      icon: <FileText size={15} />,
                      disabled: total === 0,
                    },
                    {
                      label: checklistSubmitted ? 'Word 檢核表（遞交版）' : 'Word 檢核表（送出後開放）',
                      href: `/api/cycles/${cycle.id}/export/checklist?format=docx`,
                      icon: <FileText size={15} />,
                      disabled: !checklistSubmitted,
                    },
                    ...(user.role === 'SUPER_ADMIN'
                      ? [{
                          label: 'Excel 檢核表（工作底稿）',
                          href: `/api/cycles/${cycle.id}/export/checklist`,
                          icon: <FileText size={15} />,
                        }]
                      : []),
                  ]}
                />
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

          {/* 最近活動(稽核軌跡);「查看全部」→ 完整活動歷史頁(UAT:多位管理員時知道彼此做了什麼) */}
          <div className="rounded-lg border border-rule bg-card p-4">
            <div className="mb-3 flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <History size={16} className="text-ink-500" />
                <h3 className="text-title font-medium text-ink-900">最近活動</h3>
              </div>
              {activities.length > 0 && (
                <Link href={`/cycles/${cycle.id}/activity`} className="text-caption text-primary-700 hover:underline whitespace-nowrap">
                  查看全部
                </Link>
              )}
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
        {/* 卡標題=卡片主角,放大到比下方狀態值(text-title-md 16px)更大,建立清楚層級(批61) */}
        <p className="min-w-0 flex-1 text-title-lg text-ink-900 leading-tight">{title}</p>
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
  // 同頁 hash 錨點(如機關「改善報告(用印)」卡 → #signed-report):Next <Link> 對「已在本頁、只差 hash」
  // 的連結不觸發捲動(PrimaryActionCta 已認定並繞過的同一陷阱)→ 改原生 <a> 走瀏覽器 fragment 捲動。
  if (href.includes('#')) {
    return (
      <a href={href} className="group block h-full focus-ring rounded-lg">
        {inner}
      </a>
    );
  }
  return (
    <Link href={href} className="group block h-full focus-ring rounded-lg">
      {inner}
    </Link>
  );
}
