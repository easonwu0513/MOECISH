import Link from 'next/link';
import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { AppShell } from '@/components/shell/AppShell';
import { Card, CardTitle } from '@/components/ui/Card';
import { Chip } from '@/components/ui/Chip';
import { Button } from '@/components/ui/Button';
import { ProgressBar } from '@/components/ui/ProgressBar';
import { EmptyState } from '@/components/ui/EmptyState';
import { StatTopBar } from '@/components/ui/StatTopBar';
import { IndexBadge } from '@/components/ui/IndexBadge';
import PasswordExpiryNotice from '@/components/shell/PasswordExpiryNotice';
import {
  ClipboardCheck,
  ChevronRight,
  CheckCircle,
  AlertCircle,
  ShieldCheck,
  Briefcase,
} from '@/components/icons';
import { CYCLE_STATUS_LABELS, cycleStatusTone } from '@/lib/state-machine';
import { toneClasses } from '@/lib/stage';
import { parseAssignDimensions, ASSIGN_ASPECT_LABELS } from '@/lib/audit-score';
import { PROCESS_STEPS, ROLE_STEP_DUTIES, deriveCycleFacts, nextActionForRole, fmtMD } from '@/lib/process-guide';
import { cn } from '@/lib/cn';
import { fmtROC, fmtROCWeekday } from '@/lib/date';
import RemindButton from '@/components/cycle/RemindButton';
import { IdentityBand } from '@/components/dashboard/IdentityBand';
import { PrimaryActionBanner } from '@/components/dashboard/PrimaryActionBanner';
import { ReturnsInbox } from '@/components/dashboard/ReturnsInbox';
import { getOpenReturns } from '@/lib/returns';
import { ROLE_LABELS, ROLE_TONE, auditorReviewWindowOpen, type CycleStatus } from '@/lib/types';
import { greetingByHour, EMPTY } from '@/lib/copy';

type Todo = {
  key: string;
  tone: 'warning' | 'primary' | 'sage' | 'neutral' | 'danger';
  title: string;
  href: string;
  cta: string;
};

const TONE_ORDER: Record<Todo['tone'], number> = { danger: 0, warning: 1, primary: 2, sage: 3, neutral: 4 };

// 待辦/我的稽核週期依登入者即時查詢(含新指派),不可被靜態快取
export const dynamic = 'force-dynamic';

export default async function HomePage() {
  const session = await auth();
  if (!session) redirect('/login');
  const user = session.user;

  const cyclesWhere =
    user.role === 'ORG_ADMIN'
      ? { organizationId: user.organizationId ?? '__none__' }
      : user.role === 'AUDITOR'
      // 委員不顯示開立中(DRAFT)週期 — 中心仍在調整委員名單,PREPARATION 起才可見(對齊 access-policy 'cycle.access')
      ? { assignments: { some: { auditorId: user.id } }, status: { not: 'DRAFT' } }
      : user.role === 'OBSERVER'
      // 觀察員(批30):限被配對之週期(CycleObserver),同樣不顯示開立中
      ? { observers: { some: { observerId: user.id } }, status: { not: 'DRAFT' } }
      // 未知角色 fail-closed(對齊 nav/cycles)
      : user.role === 'SUPER_ADMIN' ? {} : { id: '__none__' };

  const cycles = await prisma.auditCycle.findMany({
    where: cyclesWhere,
    include: {
      organization: true,
      deficiencies: { include: { action: { select: { status: true } } } },
      prepRequirements: { include: { submission: { select: { status: true } } } },
      signedReports: { select: { id: true, confirmedAt: true } },
      checklistVersion: { select: { _count: { select: { items: true } } } },
      responses: { select: { compliance: true, comments: { where: { resolvedAt: null }, select: { id: true } } } },
      // 委員視角:帶出本人於各週期受指派的構面(卡片標註負責構面);其他角色查無、回空陣列
      assignments: { where: { auditorId: user.id }, select: { dimensions: true } },
    },
    orderBy: [{ year: 'desc' }, { createdAt: 'desc' }],
  });

  const now = new Date();

  // ── 每週期衍生數據(與週期內頁共用 process-guide) ──
  const enriched = cycles.map((c) => ({ c, ...deriveCycleFacts(c, now, user.role === 'AUDITOR' ? user.id : undefined) }));

  // 大改造C:逾期矩陣列就地「一鍵催辦」——催辦軌跡(track-remind 已寄封數+最近寄送;與 admin/cycles 同查法)
  const overdueCycleIds = user.role === 'SUPER_ADMIN' ? enriched.filter((e) => e.overdue).map((e) => e.c.id) : [];
  const remindTrail = overdueCycleIds.length
    ? await prisma.emailLog.groupBy({
        by: ['relatedCycleId'],
        where: { relatedCycleId: { in: overdueCycleIds }, kind: 'track-remind', status: { in: ['sent', 'simulated'] } },
        _count: { _all: true },
        _max: { sentAt: true },
      })
    : [];
  const remindMap = new Map(remindTrail.map((r) => [r.relatedCycleId, { count: r._count._all, last: r._max.sentAt }]));

  // 中心:實地稽核/缺失發布中週期的委員評分完成度(scoreLockedAt),供「今日待辦」的未評分訊號
  const scoringByCycle = new Map<string, { total: number; scored: number }>();
  if (user.role === 'SUPER_ADMIN') {
    const scoringIds = cycles.filter((c) => c.status === 'ONSITE' || c.status === 'REPORT_ISSUED').map((c) => c.id);
    if (scoringIds.length > 0) {
      const asgs = await prisma.auditorAssignment.findMany({
        where: { cycleId: { in: scoringIds } },
        select: { cycleId: true, scoreLockedAt: true },
      });
      for (const a of asgs) {
        const cur = scoringByCycle.get(a.cycleId) ?? { total: 0, scored: 0 };
        cur.total += 1;
        if (a.scoreLockedAt) cur.scored += 1;
        scoringByCycle.set(a.cycleId, cur);
      }
    }
  }

  // 退回收件匣(W4):散落各頁的「退回待補正」收斂為單一區塊(機關看自家、中心看全機關)
  const openReturns = await getOpenReturns({ role: user.role, organizationId: user.organizationId });

  type Enriched = (typeof enriched)[number];

  // ── 全域統計 ──
  const sum = (f: (e: Enriched) => number) => enriched.reduce((s, e) => s + f(e), 0);
  const totalDefs = sum((e) => e.total);
  const passed = sum((e) => e.passed);
  const submitted = sum((e) => e.submitted);
  const returned = sum((e) => e.returned);
  const toFill = sum((e) => e.toFill);

  // ── 角色待辦(緊急優先) ──
  const todos: Todo[] = [];
  for (const e of enriched) {
    const { c } = e;
    const org = c.organization.shortName ?? c.organization.name;
    const base = `/cycles/${c.id}`;
    const due = fmtMD(c.dueDate);
    const prepDue = fmtMD(c.prepDueDate);
    const st = c.status as CycleStatus;

    if (user.role === 'ORG_ADMIN') {
      // 機關只計自己負責的機關區(技術檢測/實地稽核),扣除中心匯入區(CENTER);與下方準備讀數卡一致
      const techDue = fmtMD(c.prepDueTech);
      const dueText = [techDue && `技術檢測文件繳交截止日 ${techDue}`, prepDue && `實地稽核文件繳交截止日 ${prepDue}`].filter(Boolean).join('・');
      // 開立中:讓機關在主橫幅就看到「今年將被稽核」的作業通知(不只埋在鈴鐺),但屬告知性、暫無需動作
      if (st === 'DRAFT') {
        todos.push({ key: `${c.id}-draft-org`, tone: 'neutral', title: `今年度將接受資通安全稽核(開立中),請留意中心後續通知${dueText ? `;${dueText}` : ''}`, href: base, cta: '查看' });
      }
      // 退補/退回類不進待辦清單:上方「退回收件匣」已單項級直達(含退補原因),同頁不雙講(大改造A 減法)
      if (st === 'PREPARATION' && e.mechRemaining > 0) {
        todos.push({ key: `${c.id}-prep`, tone: 'primary', title: `稽核前資料還有 ${e.mechRemaining} 項未處理${dueText ? `(${dueText})` : ''}`, href: `${base}/prep`, cta: '去處理' });
      } else if (st === 'PREPARATION' && e.mechDraft > 0) {
        todos.push({ key: `${c.id}-submit`, tone: 'primary', title: `稽核前資料已齊,請按「確定繳交」送交中心`, href: `${base}/prep`, cta: '去繳交' });
      }
      // 檢核表為與資料準備平行的任務(先前不在導引中)→ 獨立提示,未送出即顯示
      if (st === 'PREPARATION' && e.checklistTotal > 0 && !e.checklistSubmitted) {
        todos.push({ key: `${c.id}-cl`, tone: 'primary', title: `資通安全檢核表待填報(${e.checklistAnswered}/${e.checklistTotal} 題)`, href: `${base}/checklist`, cta: '去填報' });
      }
      if (st === 'REMEDIATION') {
        // (退回項由退回收件匣單項級獨任,不再彙總雙講)
        if (e.toFill > 0) todos.push({ key: `${c.id}-fill`, tone: 'primary', title: `${e.toFill} 項矯正措施待填報${due ? `(截止 ${due})` : ''}`, href: `${base}/deficiencies?status=todo`, cta: '繼續填' });
        if (e.allPassed && !e.signedUploaded) todos.push({ key: `${c.id}-sign`, tone: 'sage', title: '全數通過!請列印改善報告、用印後上傳', href: `${base}#signed-report`, cta: '去上傳' });
      }
    }

    if (user.role === 'OBSERVER') {
      // 觀察員待辦(批30):審閱時段內去檢視資料;實地稽核起去撰寫練習(窗口查「觀察員」獨立區間)
      if ((st === 'READY' || st === 'ONSITE') && auditorReviewWindowOpen(c.observerWindowStart, c.observerWindowEnd)) {
        todos.push({ key: `${c.id}-ob-review`, tone: 'neutral', title: `${org}:觀察員審閱時段開放中,可檢視機關資料熟悉背景`, href: `${base}/review`, cta: '去檢視' });
      }
      if (st === 'ONSITE') {
        todos.push({ key: `${c.id}-ob-practice`, tone: 'primary', title: `${org}:實地稽核中,於「稽核發現撰寫練習」撰寫您的練習發現`, href: `${base}/practice`, cta: '去練習' });
      }
    }

    if (user.role === 'AUDITOR') {
      // 委員逐題審閱屬實地稽核階段的「筆記/快速查找」用途,選填(未留意見不算未完成)。
      // 審閱窗口未開/未設時不導向 /review(=鎖定頁死路,收斂驗證修);與 buildModuleNav 審閱卡鎖定同基準。
      if (st === 'ONSITE' && c.checklistSubmittedAt && e.reviewWindowOpen) {
        todos.push({ key: `${c.id}-review`, tone: 'neutral', title: `${org}:可逐題檢視機關自評、留審閱註記(選填)`, href: `${base}/review`, cta: '去檢視' });
      }
      if (e.submitted > 0) {
        todos.push({ key: `${c.id}-rev`, tone: 'warning', title: `${org}:${e.submitted} 項矯正待審查`, href: `${base}/deficiencies?status=submitted`, cta: '去審查' });
      }
    }

    if (user.role === 'SUPER_ADMIN') {
      if (st === 'DRAFT') {
        todos.push({ key: `${c.id}-draft`, tone: 'neutral', title: `${org}:週期開立中,完成設定後開始準備`, href: base, cta: '去設定' });
      }
      if (st === 'PREPARATION' && e.prepToConfirm > 0) {
        todos.push({ key: `${c.id}-conf`, tone: 'primary', title: `${org}:${e.prepToConfirm} 項資料已繳交,待審核確認`, href: `${base}/prep`, cta: '去審核' });
      }
      if (st === 'PREPARATION' && e.prepAllConfirmed) {
        todos.push({ key: `${c.id}-ready`, tone: 'sage', title: `${org}:資料全數確認,可安排實地稽核`, href: base, cta: '去安排' });
      }
      // 委員未評分:實地稽核起就要盯(影響報告產出與發布缺失);連到報告頁看逐委員狀態/退件
      const sc = scoringByCycle.get(c.id);
      if ((st === 'ONSITE' || st === 'REPORT_ISSUED') && sc && sc.scored < sc.total) {
        todos.push({ key: `${c.id}-score`, tone: 'warning', title: `${org}:${sc.total - sc.scored} 位委員尚未完成評分(${sc.scored}/${sc.total})`, href: `${base}/audit/report`, cta: '去查看' });
      }
      if (st === 'ONSITE') {
        // 批33 圖5:實地稽核的「下一步」=至彙整報告頁「已完成年度稽核」(FinishButton 一鍵轉缺失+推狀態+通知機關);
        // 該動作在 /audit/report,非 /deficiencies(ONSITE 尚無可發布的缺失)。
        todos.push({ key: `${c.id}-onsite`, tone: 'primary', title: `${org}:實地稽核中,結束後至彙整報告完成年度稽核`, href: `${base}/audit/report`, cta: '去彙整' });
      }
      if (st === 'REPORT_ISSUED') {
        // REPORT_ISSUED 的正確動作=推進至矯正執行(推進時自動通知機關;手動通知鈕僅 REMEDIATION 顯示)
        todos.push({ key: `${c.id}-issued`, tone: 'warning', title: `${org}:缺失已發布,推進至「矯正執行」後機關即可填報(推進時自動通知)`, href: `${base}#advanced-settings`, cta: '去推進' });
      }
      if (st === 'REMEDIATION') {
        if (e.overdue) todos.push({ key: `${c.id}-over`, tone: 'danger', title: `${org}:矯正填報已逾期${due ? `(截止 ${due})` : ''}`, href: `/admin/emails?orgIds=${c.organizationId}`, cta: '寄追蹤信' });
        if (e.allPassed && e.signedUploaded && !e.signedConfirmed) todos.push({ key: `${c.id}-close`, tone: 'sage', title: `${org}:用印報告已上傳,確認後即可結案`, href: base, cta: '去結案' });
        else if (e.allPassed && !e.signedUploaded) todos.push({ key: `${c.id}-waitsign`, tone: 'sage', title: `${org}:全數通過,待機關上傳用印報告`, href: base, cta: '查看' });
      }
    }
  }
  todos.sort((a, b) => TONE_ORDER[a.tone] - TONE_ORDER[b.tone]);

  // ── 流程指引:各步驟有幾條進行中週期 ──
  const stepCycleCounts = [0, 0, 0, 0];
  for (const e of enriched) {
    if (e.step >= 1 && e.step <= 4) stepCycleCounts[e.step - 1] += 1;
  }
  // 跨院分佈(SUPER_ADMIN 指揮台用):逾期院數、各指標散在幾院
  const overdueCount = enriched.filter((e) => e.overdue).length;
  const overdueOrgIds = Array.from(new Set(enriched.filter((e) => e.overdue).map((e) => e.c.organizationId)));
  const orgsWith = (f: (e: Enriched) => number) =>
    new Set(enriched.filter((e) => f(e) > 0).map((e) => e.c.organizationId)).size;
  const isSuper = user.role === 'SUPER_ADMIN';

  const greeting = greetingByHour(now.getHours());
  const today = fmtROCWeekday(now); // 民國年+星期(批72:原 toLocaleDateString 顯西曆,與週期頁民國年並存)
  const duties = ROLE_STEP_DUTIES[user.role];

  // 身分帶範圍 + 主行動(取最高優先待辦)
  const orgCount = new Set(cycles.map((c) => c.organizationId)).size;
  const scopeText =
    user.role === 'ORG_ADMIN'
      ? user.organizationName ?? '機關管理員'
      : user.role === 'AUDITOR'
        ? `稽核委員 · 受指派 ${cycles.length} 個週期`
        : user.role === 'OBSERVER'
          ? `觀察員 · 受配對 ${cycles.length} 個週期`
          : `教育部稽核中心 · 監督 ${orgCount} 院`;
  const topTodo = todos[0];
  // 橫幅大標去機讀句:把「院簡稱:動作」的院名拆到副標,大標只留動作句
  const topMatch = topTodo ? topTodo.title.match(/^(.+?)[:：]\s*(.+)$/) : null;
  const topAction = topTodo ? { text: topMatch ? topMatch[2] : topTodo.title, href: topTodo.href, cta: topTodo.cta } : null;
  const topSubtext = topMatch ? topMatch[1] : undefined;
  // 中心跨院總覽讀數(院數型,對齊中心心智模型)
  const remediationCount = enriched.filter((e) => e.status === 'REMEDIATION').length;
  const confirmOrgs = orgsWith((e) => e.prepToConfirm);

  return (
    <AppShell
      user={{ name: user.name, email: user.email, role: user.role, organizationName: user.organizationName }}
      crumbs={[{ label: '總覽' }]}
    >
      <PasswordExpiryNotice />
      {/* 身分帶 + 主行動橫幅(③ 工作台頂部) */}
      <section className="mb-6">
        <h1 className="sr-only">總覽工作台</h1>
        <p className="text-caption text-ink-500 tracking-wide mb-2">{today}</p>
        {/* 早安身分帶 與「建議的下一步」整併為同一列(有週期時並排;無週期時身分帶滿版) */}
        <div className={cn('grid gap-4 items-stretch', cycles.length > 0 ? 'lg:grid-cols-2' : 'grid-cols-1')}>
          <IdentityBand
            avatar={user.name.slice(0, 1)}
            title={`${greeting}，${user.name}`}
            subtitle={scopeText}
            roleChip={<Chip tone={ROLE_TONE[user.role]} size="sm">{ROLE_LABELS[user.role]}</Chip>}
            right={
              todos.length > 0 ? (
                <>
                  <div className="text-title-md text-ink-500 tabular-nums leading-none">{todos.length}</div>
                  <div className="text-label-sm text-ink-500 mt-1">件待辦</div>
                </>
              ) : undefined
            }
          />
          {cycles.length > 0 && (
            <PrimaryActionBanner next={topAction} subtext={topSubtext} doneText="目前沒有待辦事項,一切都在進度上。" />
          )}
        </div>
      </section>

      {/* 退回收件匣:散落各頁的退回待補正收斂於此(機關 / 中心;無退回則不顯示) */}
      <ReturnsInbox items={openReturns} showOrg={isSuper} />

      {cycles.length === 0 ? (
        <Card variant="outlined" padded={false}>
          <div className="p-6">
            <EmptyState
              icon={<ClipboardCheck size={28} />}
              title={isSuper ? EMPTY.noCyclesAdmin.title : EMPTY.noCycles.title}
              description={isSuper ? EMPTY.noCyclesAdmin.description : EMPTY.noCycles.description}
              action={
                isSuper ? (
                  <div className="flex gap-2 flex-wrap justify-center">
                    <Button href="/admin/cycles" variant="tonal" size="sm">開立稽核週期</Button>
                    <Button href="/admin/organizations" variant="text" size="sm">醫院管理</Button>
                  </div>
                ) : undefined
              }
            />
          </div>
        </Card>
      ) : (
        <>
          {/* 中心:跨院總覽 4 讀數(移至矩陣之上;其餘角色有各自的讀數,不顯示這排缺失導向統計) */}
          {isSuper && (
          <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            <StatTopBar tone="primary" icon={<Briefcase size={20} />} primary={`${orgCount}`} label="本期院所" sub="全國納管醫院" />
            <StatTopBar tone="danger" muted={overdueCount === 0} icon={<AlertCircle size={20} />} primary={`${overdueCount}`} label="逾期需催辦" sub={overdueCount > 0 ? `${overdueOrgIds.length} 院已逾期` : '無逾期'} />
            <StatTopBar tone="warning" muted={confirmOrgs === 0} icon={<ClipboardCheck size={20} />} primary={`${confirmOrgs}`} label="待你確認齊備" sub={confirmOrgs > 0 ? '已繳交待確認' : '無待確認'} />
            <StatTopBar tone="primary" muted={remediationCount === 0} icon={<ShieldCheck size={20} />} primary={`${remediationCount}`} label="矯正執行中" sub={remediationCount > 0 ? '缺失改善追蹤' : '無矯正中'} />
          </section>
          )}

          {/* 待辦清單(大改造A):原僅中心可見完整清單,機關/委員只有第一名橫幅→全角色開放。
              依緊急度排序、每列直達對應頁;退回/退補類不在此(由上方退回收件匣單項級獨任)。 */}
          {todos.length > 0 && (
            <section className="mb-6 rounded-lg border border-rule bg-card shadow-elev-1 overflow-hidden">
              <div className="flex items-center justify-between gap-3 flex-wrap px-4 py-3 border-b border-rule">
                <p className="text-label-sm font-medium uppercase tracking-[0.08em] text-ink-500">
                  {isSuper ? '今日待辦' : '待辦清單'} · {todos.length} 件
                </p>
                <span className="text-caption text-ink-500">依緊急程度排序</span>
              </div>
              <ul className="divide-y divide-rule">
                {todos.slice(0, 8).map((t) => {
                  // 網格化:院名固定欄 + 動作欄 + CTA 右對齊欄,逐列掃讀更快(窄螢幕退回單行 flex)
                  const m = t.title.match(/^(.+?)[:：]\s*(.+)$/);
                  return (
                    <li key={t.key}>
                      <Link
                        href={t.href}
                        className="group flex items-center gap-3 px-4 py-3 hover:bg-paper-sunk transition-colors focus-ring sm:grid sm:grid-cols-[8px_8.5rem_minmax(0,1fr)_auto]"
                      >
                        <span className={cn('w-2 h-2 rounded-full shrink-0', toneClasses(t.tone).dot)} aria-hidden />
                        <span className="sm:hidden min-w-0 flex-1 text-body-sm text-ink-900">{t.title}</span>
                        {m ? (
                          <>
                            <span className="hidden sm:block text-body-sm font-medium text-ink-900 truncate" title={m[1]}>{m[1]}</span>
                            <span className="hidden sm:block min-w-0 text-body-sm text-ink-500 truncate">{m[2]}</span>
                          </>
                        ) : (
                          <span className="hidden sm:block sm:col-span-2 min-w-0 text-body-sm text-ink-900 truncate">{t.title}</span>
                        )}
                        <span className="shrink-0 inline-flex items-center gap-0.5 text-label-lg font-medium text-primary-700 sm:justify-self-end">
                          {t.cta}
                          <ChevronRight size={14} className="transition-transform group-hover:translate-x-0.5" />
                        </span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
              {todos.length > 8 && (
                <div className="px-4 py-2.5 border-t border-rule text-caption text-ink-500">
                  另有 {todos.length - 8} 件較不緊急的待辦,
                  {isSuper ? '可由下方「跨院週期總覽」逐院處理。' : '可由下方週期卡逐一處理。'}
                </div>
              )}
            </section>
          )}

          {/* SUPER_ADMIN 跨院健康度矩陣(③ 資料視覺化:一眼看出哪家落後 + 待中心動作) */}
          {isSuper && (
            <section className="mb-6 rounded-lg border border-rule bg-card shadow-elev-1 overflow-hidden">
              <div className="flex items-center justify-between gap-3 flex-wrap px-4 py-3 border-b border-rule">
                <p className="text-label-sm font-medium uppercase tracking-[0.08em] text-ink-500">跨院週期總覽 · {cycles.length} 個週期</p>
                <span className="text-caption text-ink-500">左色條 = 階段;逾期以紅標示</span>
              </div>
              <ul className="divide-y divide-rule">
                {[...enriched]
                  .sort((a, b) => Number(b.overdue) - Number(a.overdue) || a.step - b.step)
                  .slice(0, 8)
                  .map((e) => {
                    const tone = cycleStatusTone(e.status);
                    return (
                      <li
                        key={e.c.id}
                        className={cn(
                          // 逾期=最高語意優先級→最高視覺權重(批78 P0):實心 danger-600 左框 + 實心 danger-50 底,
                          // 取代原 border=階段色+bg-danger-50/50 弱訊號。左色條 hover 4→6px=克制招牌微互動。
                          'flex flex-wrap items-center gap-x-3 gap-y-1.5 border-l-4 px-4 py-3 transition-[border-left-width] duration-200 ease-standard hover:border-l-[6px]',
                          e.overdue ? 'border-l-danger-600 bg-danger-50' : toneClasses(tone).border,
                        )}
                      >
                        {e.overdue && <span className="sr-only">已逾期;</span>}
                        <Link href={`/cycles/${e.c.id}`} className="min-w-0 flex-1 hover:underline focus-ring rounded" title={e.c.organization.name}>
                          <span className="text-body-sm text-ink-900">{e.c.organization.name}</span>
                          <span className="text-caption text-ink-500"> · {e.c.year - 1911} 年度</span>
                        </Link>
                        {e.overdue && <Chip tone="danger" size="sm" variant="filled">逾期</Chip>}
                        <Chip tone={tone} size="sm">{CYCLE_STATUS_LABELS[e.status]}</Chip>
                        {/* 減法(審計#5):矩陣退為純狀態總覽——動作 CTA 由上方「今日待辦」獨任。
                            例外=逾期列就地「一鍵催辦」(大改造C):寄標準追蹤提醒不離頁,含催辦軌跡;
                            客製/群發追蹤信仍走 Email 頁(今日待辦逾期列引導),兩工具深度不同不重複。 */}
                        {e.overdue && (
                          <RemindButton
                            cycleId={e.c.id}
                            orgName={e.c.organization.name}
                            yearLabel={String(e.c.year - 1911)}
                            lastLabel={remindMap.get(e.c.id)?.last ? fmtROC(remindMap.get(e.c.id)!.last!) : null}
                            remindCount={remindMap.get(e.c.id)?.count ?? 0}
                          />
                        )}
                      </li>
                    );
                  })}
              </ul>
              {(overdueCount > 0 || enriched.length > 8) && (
                <div className="flex items-center justify-between gap-3 flex-wrap px-4 py-2.5 border-t border-rule">
                  {overdueCount > 0 ? (
                    <Link href={`/admin/emails?orgIds=${overdueOrgIds.join(',')}`} className="inline-flex items-center min-h-11 -my-1 text-caption text-danger-700 hover:underline focus-ring rounded">
                      ⚠ {overdueCount} 個週期矯正已逾期,一鍵催辦(已預選 {overdueOrgIds.length} 院)→
                    </Link>
                  ) : (
                    <span />
                  )}
                  {enriched.length > 8 && (
                    <Link href="/admin/cycles" className="inline-flex items-center min-h-11 -my-1 text-caption text-primary-700 hover:underline focus-ring rounded">查看全部 {enriched.length} 個週期 →</Link>
                  )}
                </div>
              )}
            </section>
          )}

          {isSuper && (
            <div className="flex gap-2 flex-wrap mb-8">
              <Button href="/admin/cycles" size="sm" variant="tonal">開立稽核週期</Button>
              <Button href="/admin/organizations" size="sm" variant="text">醫院管理</Button>
            </div>
          )}

          {/* 委員 / 機關:我的(負責)週期 + 待辦(中心已由跨院矩陣涵蓋,不重複出清單) */}
          {/* 委員 / 機關:我的(負責)週期 —— 乾淨任務卡(中心已由跨院矩陣涵蓋) */}
          {!isSuper && (
            <section className="mb-8">
              {/* (大改造A 減法:原機關「準備讀數摘要卡」由上方全角色待辦清單涵蓋——未處理/待繳/檢核表列
                  皆在清單直達,退補項由退回收件匣單項級承擔;不再三重呈現) */}

              <div className="flex items-baseline justify-between mb-3 px-1">
                <p className="text-label-sm font-medium uppercase tracking-[0.08em] text-ink-500">
                  {user.role === 'AUDITOR' ? `我負責的週期 · ${enriched.length} 個機關` : user.role === 'OBSERVER' ? `我觀摩的週期 · ${enriched.length} 個機關` : '我的稽核週期'}
                </p>
                <Link href="/cycles" className="text-caption text-primary-700 hover:underline">查看全部</Link>
              </div>
              <div className="flex flex-col gap-2.5">
                {enriched.map((e) => {
                  const { c } = e;
                  const next = nextActionForRole(user.role, e);
                  const tone = cycleStatusTone(c.status as CycleStatus);
                  const border = toneClasses(tone).border;
                  const auditorDims = user.role === 'AUDITOR'
                    ? parseAssignDimensions(c.assignments?.[0]?.dimensions).map((d) => ASSIGN_ASPECT_LABELS[d])
                    : [];
                  // 委員於結案後不可再進入(access-policy);列顯示已結案並鎖定
                  const lockedForAuditor = (user.role === 'AUDITOR' || user.role === 'OBSERVER') && c.status === 'CLOSED';
                  if (lockedForAuditor) {
                    return (
                      <div
                        key={c.id}
                        aria-disabled
                        className={cn(
                          'flex items-center gap-3 rounded-lg border border-rule border-l-4 bg-paper-sunk px-4 py-3.5 cursor-not-allowed',
                          border,
                        )}
                      >
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-body-sm font-medium text-ink-900 truncate">{c.organization.name}</span>
                            <Chip tone={tone} size="sm" dot>{CYCLE_STATUS_LABELS[c.status as CycleStatus]}</Chip>
                            <span className="text-caption text-ink-500 tabular-nums">{c.year - 1911} 年度</span>
                          </div>
                          <p className="mt-1 text-caption text-ink-500">本週期已結案,資料已鎖定。</p>
                        </div>
                      </div>
                    );
                  }
                  return (
                    <Link
                      key={c.id}
                      href={`/cycles/${c.id}`}
                      className={cn(
                        // 邊框透明度與上方鎖定卡齊平(批78:同類卡片 /60 vs 全實心漂移收斂)
                        'flex items-center gap-3 rounded-lg border border-rule border-l-4 bg-card px-4 py-3.5 hover:bg-paper-sunk transition-colors focus-ring',
                        border,
                      )}
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-body-sm font-medium text-ink-900 truncate">{c.organization.name}</span>
                          <Chip tone={tone} size="sm" dot>{CYCLE_STATUS_LABELS[c.status as CycleStatus]}</Chip>
                          <span className="text-caption text-ink-500 tabular-nums">{c.year - 1911} 年度</span>
                          {auditorDims.length > 0 && (
                            <span className="text-caption text-primary-700">負責構面:{auditorDims.join('、')}</span>
                          )}
                        </div>
                        {next?.text && <p className="mt-1 text-caption text-ink-500 truncate">{next.text}</p>}
                      </div>
                      {next?.cta && (
                        <span className="shrink-0 inline-flex items-center gap-0.5 text-label-lg font-medium text-primary-700">
                          {next.cta}
                          <ChevronRight size={16} />
                        </span>
                      )}
                    </Link>
                  );
                })}
                {enriched.length === 0 && (
                  <EmptyState tone="success" icon={<CheckCircle size={28} />} title={EMPTY.noTodos.title} description={EMPTY.noTodos.description} />
                )}
              </div>
            </section>
          )}

          {/* ════ 流程指引:四步驟 × 我的角色工作 ════ */}
          {!isSuper && (
          <section className="mb-8 rounded-lg border border-rule bg-card overflow-hidden">
            <div className="flex items-center gap-3 px-5 pt-5 pb-1 flex-wrap">
              <CardTitle className="text-title-lg">稽核流程指引</CardTitle>
              <Chip tone={ROLE_TONE[user.role]} size="sm">{ROLE_LABELS[user.role]}</Chip>
              <span className="text-caption text-ink-500">
                你在每一階段的工作;標亮 = 有週期正在該階段
              </span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-px bg-rule mt-3">
              {PROCESS_STEPS.map((s, i) => {
                const active = stepCycleCounts[i] > 0;
                return (
                  <div key={s.no} className={`p-5 ${active ? 'bg-primary-50/50' : 'bg-card'}`}>
                    <div className="flex items-center gap-2 mb-2">
                      <IndexBadge n={s.no} state={active ? 'active' : 'default'} size="sm" shape="circle" />
                      <p className={`text-label-lg ${active ? 'text-primary-800 font-semibold' : 'text-ink-900'}`}>
                        {s.title}
                      </p>
                      {active && (
                        <span className="ml-auto text-caption text-primary-700 tabular-nums shrink-0">
                          {stepCycleCounts[i]} 週期
                        </span>
                      )}
                    </div>
                    <p className="text-caption text-ink-500 leading-relaxed">{duties[i]}</p>
                  </div>
                );
              })}
            </div>
          </section>
          )}
        </>
      )}
    </AppShell>
  );
}

