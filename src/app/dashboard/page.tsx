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
import { CycleStepper } from '@/components/dashboard/CycleStepper';
import PasswordExpiryNotice from '@/components/shell/PasswordExpiryNotice';
import {
  ClipboardCheck,
  ChevronRight,
  CheckCircle,
  AlertCircle,
  ShieldCheck,
  Eye,
} from '@/components/icons';
import { CYCLE_STATUS_LABELS, cycleStatusTone } from '@/lib/state-machine';
import { PROCESS_STEPS, ROLE_STEP_DUTIES, deriveCycleFacts, nextActionForRole, fmtMD } from '@/lib/process-guide';
import { cn } from '@/lib/cn';
import { IdentityBand } from '@/components/dashboard/IdentityBand';
import { PrimaryActionBanner } from '@/components/dashboard/PrimaryActionBanner';
import { ROLE_LABELS, ROLE_TONE, type CycleStatus } from '@/lib/types';
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
      ? { assignments: { some: { auditorId: user.id } } }
      : {};

  const cycles = await prisma.auditCycle.findMany({
    where: cyclesWhere,
    include: {
      organization: true,
      deficiencies: { include: { action: { select: { status: true } } } },
      prepRequirements: { include: { submission: { select: { status: true } } } },
      signedReports: { select: { id: true, confirmedAt: true } },
      checklistVersion: { select: { _count: { select: { items: true } } } },
      responses: { select: { compliance: true, comments: { where: { resolvedAt: null }, select: { id: true } } } },
    },
    orderBy: [{ year: 'desc' }, { createdAt: 'desc' }],
  });

  const now = new Date();

  // ── 每週期衍生數據(與週期內頁共用 process-guide) ──
  const enriched = cycles.map((c) => ({ c, ...deriveCycleFacts(c, now) }));

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
      if (st === 'PREPARATION' && e.prepInsufficient > 0) {
        todos.push({ key: `${c.id}-insuf`, tone: 'danger', title: `${e.prepInsufficient} 項稽核前資料被退回,請補正後重新繳交`, href: `${base}/prep`, cta: '去補正' });
      } else if (st === 'PREPARATION' && e.prepRemaining > 0) {
        todos.push({ key: `${c.id}-prep`, tone: 'primary', title: `稽核前資料還有 ${e.prepRemaining}/${e.prepTotal} 項未處理${prepDue ? `(截止 ${prepDue})` : ''}`, href: `${base}/prep`, cta: '去處理' });
      } else if (st === 'PREPARATION' && e.prepDraft > 0) {
        todos.push({ key: `${c.id}-submit`, tone: 'primary', title: `稽核前資料已齊,請按「確定繳交」送交中心`, href: `${base}/prep`, cta: '去繳交' });
      }
      // 檢核表為與資料準備平行的任務(先前不在導引中)→ 獨立提示,未送出即顯示
      if (st === 'PREPARATION' && e.checklistTotal > 0 && !e.checklistSubmitted) {
        todos.push({ key: `${c.id}-cl`, tone: 'primary', title: `資安檢核表待填報(${e.checklistAnswered}/${e.checklistTotal} 題)`, href: `${base}/checklist`, cta: '去填報' });
      }
      if (st === 'REMEDIATION') {
        if (e.returned > 0) todos.push({ key: `${c.id}-ret`, tone: 'danger', title: `${e.returned} 項被退回,需補正後重送`, href: `${base}/deficiencies?status=returned`, cta: '去補正' });
        if (e.toFill > 0) todos.push({ key: `${c.id}-fill`, tone: 'primary', title: `${e.toFill} 項矯正措施待填報${due ? `(截止 ${due})` : ''}`, href: `${base}/deficiencies?status=todo`, cta: '繼續填' });
        if (e.allPassed && !e.signedUploaded) todos.push({ key: `${c.id}-sign`, tone: 'sage', title: '全數通過!請列印改善報告、用印後上傳', href: `${base}#signed-report`, cta: '去上傳' });
      }
    }

    if (user.role === 'AUDITOR') {
      // 委員逐題審閱屬實地稽核階段的「筆記/快速查找」用途,選填(未留意見不算未完成)
      if (st === 'ONSITE' && c.checklistSubmittedAt) {
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
      if (st === 'ONSITE') {
        todos.push({ key: `${c.id}-onsite`, tone: 'primary', title: `${org}:實地稽核中,結束後發布缺失`, href: `${base}/deficiencies`, cta: '去發布' });
      }
      if (st === 'REPORT_ISSUED') {
        todos.push({ key: `${c.id}-issued`, tone: 'warning', title: `${org}:缺失已發布,通知機關開始矯正`, href: base, cta: '去通知' });
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
  const today = now.toLocaleDateString('zh-TW', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' });
  const duties = ROLE_STEP_DUTIES[user.role];

  // 身分帶範圍 + 主行動(取最高優先待辦)
  const orgCount = new Set(cycles.map((c) => c.organizationId)).size;
  const scopeText =
    user.role === 'ORG_ADMIN'
      ? user.organizationName ?? '機關承辦'
      : user.role === 'AUDITOR'
        ? `稽核委員 · 經指派 ${cycles.length} 個週期`
        : `教育部稽核中心 · 監督 ${orgCount} 院`;
  const topTodo = todos[0];
  const topAction = topTodo ? { text: topTodo.title, href: topTodo.href, cta: topTodo.cta } : null;

  return (
    <AppShell
      user={{ name: user.name, email: user.email, role: user.role, organizationName: user.organizationName }}
      crumbs={[{ label: '總覽' }]}
    >
      <PasswordExpiryNotice />
      {/* 身分帶 + 主行動橫幅(③ 工作台頂部) */}
      <section className="mb-6">
        <h1 className="sr-only">總覽工作台</h1>
        <p className="text-caption text-on-surface-variant tracking-wide mb-2">{today}</p>
        <IdentityBand
          avatar={user.name.slice(0, 1)}
          title={`${greeting}，${user.name}`}
          subtitle={scopeText}
          roleChip={<Chip tone={ROLE_TONE[user.role]} size="sm">{ROLE_LABELS[user.role]}</Chip>}
          right={
            todos.length > 0 ? (
              <>
                <div className="text-headline text-primary-700 tabular-nums leading-none">{todos.length}</div>
                <div className="text-label-sm text-on-surface-variant mt-1">件待辦</div>
              </>
            ) : undefined
          }
        />
        {cycles.length > 0 && (
          <PrimaryActionBanner next={topAction} className="mt-4" doneText="目前沒有待辦事項,一切都在進度上。" />
        )}
      </section>

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
          {/* SUPER_ADMIN 跨院健康度矩陣(③ 資料視覺化:一眼看出哪家落後 + 待中心動作) */}
          {isSuper && (
            <section className="mb-6 rounded-md border border-outline-variant/60 bg-surface-container-lowest overflow-hidden">
              <div className="flex items-center justify-between gap-3 flex-wrap px-4 py-3 border-b border-outline-variant/60">
                <p className="text-label-sm font-medium uppercase tracking-[0.08em] text-on-surface-variant">跨院健康度 · {cycles.length} 個週期</p>
                <div className="flex gap-3 text-caption text-on-surface-variant">
                  <span className="inline-flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-danger-500" aria-hidden />落後</span>
                  <span className="inline-flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-warning-400" aria-hidden />待留意</span>
                  <span className="inline-flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-success-500" aria-hidden />正常</span>
                </div>
              </div>
              <ul className="divide-y divide-outline-variant/50">
                {[...enriched]
                  .sort((a, b) => Number(b.overdue) - Number(a.overdue) || a.step - b.step)
                  .slice(0, 8)
                  .map((e) => {
                    const n = nextActionForRole('SUPER_ADMIN', e);
                    const waiting = e.prepToConfirm > 0 || (e.allPassed && e.signedUploaded && !e.signedConfirmed);
                    const dot = e.overdue ? 'bg-danger-500' : waiting ? 'bg-warning-400' : 'bg-success-500';
                    return (
                      <li key={e.c.id} className={cn('flex items-center gap-3 px-4 py-3', e.overdue && 'bg-danger-50/40')}>
                        <span className={cn('w-2.5 h-2.5 rounded-full shrink-0', dot)} aria-hidden />
                        <Link href={`/cycles/${e.c.id}`} className="min-w-0 flex-1 hover:underline focus-ring rounded">
                          <span className="text-body-sm text-on-surface">{e.c.organization.name}</span>
                          <span className="text-caption text-on-surface-variant"> · {e.c.year - 1911} 年度</span>
                        </Link>
                        <Chip tone={cycleStatusTone(e.status)} size="sm">{CYCLE_STATUS_LABELS[e.status]}</Chip>
                        {n?.text && <span className="hidden md:block max-w-[15rem] truncate text-caption text-on-surface-variant">{n.text}</span>}
                      </li>
                    );
                  })}
              </ul>
              {(overdueCount > 0 || enriched.length > 8) && (
                <div className="flex items-center justify-between gap-3 flex-wrap px-4 py-2.5 border-t border-outline-variant/60">
                  {overdueCount > 0 ? (
                    <Link href={`/admin/emails?orgIds=${overdueOrgIds.join(',')}`} className="text-caption text-danger-700 hover:underline">
                      ⚠ {overdueCount} 個週期矯正已逾期,一鍵催辦(已預選 {overdueOrgIds.length} 院)→
                    </Link>
                  ) : (
                    <span />
                  )}
                  {enriched.length > 8 && (
                    <Link href="/admin/cycles" className="text-caption text-primary-700 hover:underline">查看全部 {enriched.length} 個週期 →</Link>
                  )}
                </div>
              )}
            </section>
          )}

          {/* 中心:跨院總覽 4 讀數(其餘角色有各自的讀數,不顯示這排缺失導向統計) */}
          {isSuper && (
          <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            <StatTopBar
              tone="success"
              icon={<ShieldCheck size={20} />}
              primary={`${passed}/${totalDefs}`}
              label="矯正通過"
              sub={totalDefs ? `${Math.round((passed / totalDefs) * 100)}% 完成` : '尚無缺失'}
            />
            <StatTopBar
              tone="sage"
              icon={<Eye size={20} />}
              primary={`${submitted}`}
              label="待委員審查"
              sub={submitted > 0 ? (isSuper ? `散在 ${orgsWith((e) => e.submitted)} 院` : '已送審項目') : '無待審'}
            />
            <StatTopBar
              tone="warning"
              muted={toFill === 0}
              icon={<ClipboardCheck size={20} />}
              primary={`${toFill}`}
              label="待填報"
              sub={toFill > 0 ? (isSuper ? `${orgsWith((e) => e.toFill)} 院尚未送審` : '機關尚未送審') : '全部已送'}
            />
            <StatTopBar
              tone="danger"
              muted={returned === 0}
              icon={<AlertCircle size={20} />}
              primary={`${returned}`}
              label="退回補正"
              sub={returned > 0 ? (isSuper ? `${orgsWith((e) => e.returned)} 院需處理` : '需儘速處理') : '無退回'}
            />
          </section>
          )}

          {isSuper && (
            <div className="flex gap-2 flex-wrap mb-8">
              <Button href="/admin/cycles" size="sm" variant="tonal">開立稽核週期</Button>
              <Button href="/admin/organizations" size="sm" variant="text">醫院管理</Button>
            </div>
          )}

          {/* 委員 / 機關:我的(負責)週期 + 待辦(中心已由跨院矩陣涵蓋,不重複出清單) */}
          {!isSuper && (
          <section className="grid grid-cols-1 lg:grid-cols-5 gap-5 mb-6">
            {/* 週期清單 */}
            <Card className="lg:col-span-3" variant="elevated">
              <div className="flex items-baseline justify-between mb-4">
                <CardTitle className="text-title-lg">
                  {user.role === 'SUPER_ADMIN' ? '全部稽核週期' : '我的稽核週期'}
                </CardTitle>
                <Link href="/cycles" className="text-caption text-primary-700 hover:underline">
                  查看全部
                </Link>
              </div>
              <div className="flex flex-col gap-3">
                {enriched.slice(0, 5).map((e) => {
                  const { c } = e;
                  const next = nextActionForRole(user.role, e);
                  return (
                    <div key={c.id} className="group rounded-md border border-outline-variant hover:border-outline transition-colors">
                      <Link href={`/cycles/${c.id}`} className="block p-4 pb-3 hover:bg-surface-container transition-colors rounded-t-md focus-ring">
                        <div className="flex items-center justify-between gap-3 mb-3">
                          <p className="text-body-sm font-medium text-on-surface truncate">
                            {c.year - 1911} 年度 · {c.organization.name}
                          </p>
                          <Chip tone={cycleStatusTone(c.status as CycleStatus)} size="sm" dot>
                            {CYCLE_STATUS_LABELS[c.status as CycleStatus]}
                          </Chip>
                        </div>
                        <CycleStepper current={e.step} statusLabel={CYCLE_STATUS_LABELS[c.status as CycleStatus]} className="mb-3" />
                        {e.total > 0 && (
                          <>
                            <ProgressBar value={e.passed} max={e.total} tone="primary" size="sm" />
                            <div className="mt-1.5 flex justify-between text-caption text-on-surface-variant">
                              <span>矯正通過 <span className="tabular-nums font-medium text-on-surface">{e.passed}</span> / {e.total}</span>
                              <span className="tabular-nums">{Math.round((e.passed / e.total) * 100)}%</span>
                            </div>
                          </>
                        )}
                      </Link>
                      {next && (
                        <div className="flex items-center gap-2 px-4 py-2.5 border-t border-outline-variant/60 bg-surface-container-low/60 rounded-b-md">
                          <span className="text-caption text-primary-700 font-medium shrink-0">下一步</span>
                          <span className="text-caption text-on-surface-variant truncate flex-1">{next.text}</span>
                          {next.href && next.cta && (
                            <Link href={next.href} className="text-caption text-primary-700 hover:underline shrink-0 inline-flex items-center gap-0.5">
                              {next.cta}
                              <ChevronRight size={12} />
                            </Link>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </Card>

            {/* 待辦 */}
            <Card className="lg:col-span-2" variant="elevated">
              <div className="flex items-center justify-between mb-4">
                <CardTitle className="text-title-lg">待辦</CardTitle>
                <span className="text-caption text-on-surface-variant">按緊急度排序</span>
              </div>
              <div className="flex flex-col gap-1.5">
                {todos.length === 0 ? (
                  <EmptyState
                    tone="success"
                    icon={<CheckCircle size={28} />}
                    title={EMPTY.noTodos.title}
                    description={EMPTY.noTodos.description}
                  />
                ) : (
                  todos.map((t) => (
                    <Link
                      key={t.key}
                      href={t.href}
                      className="group relative flex items-center gap-3 rounded-sm px-3 py-3 hover:bg-surface-container transition-colors duration-200 ease-standard focus-ring"
                    >
                      <span
                        className={
                          'w-2 h-2 rounded-full shrink-0 ' +
                          {
                            warning: 'bg-warning-500',
                            primary: 'bg-primary-500',
                            sage: 'bg-sage-500',
                            neutral: 'bg-neutral-500',
                            danger: 'bg-danger-500',
                          }[t.tone]
                        }
                        aria-hidden
                      />
                      <span className="flex-1 text-body-sm text-on-surface-variant truncate">{t.title}</span>
                      <span className="text-caption text-on-surface-variant group-hover:text-primary-700 shrink-0 inline-flex items-center gap-0.5 transition-colors">
                        {t.cta}
                        <ChevronRight size={14} />
                      </span>
                    </Link>
                  ))
                )}
              </div>

              {user.role === 'SUPER_ADMIN' && (
                <div className="mt-5 pt-4 border-t border-outline-variant flex gap-2 flex-wrap">
                  <Link href="/admin/cycles">
                    <Button size="sm" variant="tonal">開立稽核週期</Button>
                  </Link>
                  <Link href="/admin/organizations">
                    <Button size="sm" variant="text">醫院管理</Button>
                  </Link>
                </div>
              )}
            </Card>
          </section>
          )}

          {/* ════ 流程指引:四步驟 × 我的角色工作 ════ */}
          {!isSuper && (
          <section className="mb-10 rounded-md border border-outline-variant/60 bg-surface-container-lowest overflow-hidden">
            <div className="flex items-center gap-3 px-5 pt-5 pb-1 flex-wrap">
              <CardTitle className="text-title-lg">稽核流程指引</CardTitle>
              <Chip tone={ROLE_TONE[user.role]} size="sm">{ROLE_LABELS[user.role]}</Chip>
              <span className="text-caption text-on-surface-variant">
                你在每一階段的工作;標亮 = 有週期正在該階段
              </span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-px bg-outline-variant/40 mt-3">
              {PROCESS_STEPS.map((s, i) => {
                const active = stepCycleCounts[i] > 0;
                return (
                  <div key={s.no} className={`p-5 ${active ? 'bg-primary-50/50' : 'bg-surface-container-lowest'}`}>
                    <div className="flex items-center gap-2 mb-2">
                      <span
                        className={`w-6 h-6 rounded-full flex items-center justify-center text-caption font-semibold tabular-nums shrink-0 ${
                          active ? 'bg-primary-600 text-white' : 'bg-surface-container-high text-on-surface-variant'
                        }`}
                        aria-hidden
                      >
                        {s.no}
                      </span>
                      <p className={`text-label-lg ${active ? 'text-primary-800 font-semibold' : 'text-on-surface'}`}>
                        {s.title}
                      </p>
                      {active && (
                        <span className="ml-auto text-caption text-primary-700 tabular-nums shrink-0">
                          {stepCycleCounts[i]} 週期
                        </span>
                      )}
                    </div>
                    <p className="text-caption text-on-surface-variant leading-relaxed">{duties[i]}</p>
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

