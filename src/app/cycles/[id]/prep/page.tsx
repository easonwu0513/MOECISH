import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { prisma } from '@/lib/db';
import { auth } from '@/lib/auth';
import { fmtROC } from '@/lib/date';
import { auditorCanSeePrep, auditorCanSeeCycle, reviewWindowStateForRole, onsiteStageEnded, type CycleStatus, type Role } from '@/lib/types';
import { buildModuleNav } from '@/lib/cycle-modules';
import { AppShell } from '@/components/shell/AppShell';
import { CycleHubBar } from '@/components/cycle/CycleHubBar';
import { ReviewWindowLockNotice } from '@/components/cycle/ReviewWindowLock';
import { TileIcon, StatusPill } from '@/components/cycle/tile';
import { SURFACE_INFO } from '@/lib/tone';
import { Button } from '@/components/ui/Button';
import { FileText, ClipboardCheck, Eye, EyeOff, AlertTriangle, CheckCircle, ChevronRight, Check, Download, Pencil } from '@/components/icons';
import { getTemplateFilesForYear } from '@/lib/prep-standard';
import PrepBoard from './PrepBoard';
import { ReviewWindowSetting } from './ReviewWindowSetting';
import LockedNavItem from './LockedNavItem';

/** 將 +08:00 儲存的 Date 還原為當地 yyyy-mm-dd(供 date input;窗口起=00:00、迄=23:59:59 皆落在同一當地日) */
function isoDate(d: Date): string {
  return new Date(d.getTime() + 8 * 3600 * 1000).toISOString().slice(0, 10);
}

export default async function PrepPage({ params }: { params: { id: string } }) {
  const session = await auth();
  if (!session) redirect(`/login?callbackUrl=/cycles/${params.id}/prep`);
  const user = session.user;
  // 未列舉角色預設拒絕(批30 雷區:新角色落過各 role redirect 即 fail-open 繼承視野)
  if (!['SUPER_ADMIN', 'ORG_ADMIN', 'AUDITOR', 'OBSERVER'].includes(user.role)) redirect('/dashboard');

  const cycle = await prisma.auditCycle.findUnique({
    where: { id: params.id },
    include: {
      organization: true,
      assignments: true,
      // 左欄模組卡狀態(buildModuleNav 單一來源)所需讀數
      checklistVersion: { select: { _count: { select: { items: true } } } },
      signedReports: { select: { submittedAt: true, confirmedAt: true } },
    },
  });
  if (!cycle) notFound();
  if (user.role === 'ORG_ADMIN' && cycle.organizationId !== user.organizationId) redirect('/dashboard');
  // 委員:未指派或週期仍開立中(DRAFT) → 導回(對齊 access-policy 'cycle.access')
  if (user.role === 'AUDITOR' && (!cycle.assignments.some((a) => a.auditorId === user.id) || !auditorCanSeeCycle(cycle.status))) redirect('/dashboard');
  // 觀察員(批30):未配對或開立中 → 導回;配對查 CycleObserver(絕不與委員指派混表)
  if (user.role === 'OBSERVER') {
    const paired = await prisma.cycleObserver.findUnique({
      where: { cycleId_observerId: { cycleId: cycle.id, observerId: user.id } },
      select: { id: true },
    });
    if (!paired || !auditorCanSeeCycle(cycle.status)) redirect('/dashboard');
  }

  const requirements = await prisma.prepRequirement.findMany({
    where: { cycleId: cycle.id },
    include: { submission: true },
    orderBy: { orderIndex: 'asc' },
  });
  // 所有項目的佐證檔(供委員可見性判斷:中心匯入區有檔即開放)
  const allSubIds = requirements.map((r) => r.submission?.id).filter(Boolean) as string[];
  const allFiles = allSubIds.length
    ? await prisma.evidence.findMany({
        where: { targetType: 'PREP_SUBMISSION', targetId: { in: allSubIds } },
        select: { id: true, targetId: true, originalName: true, sizeBytes: true },
        orderBy: { uploadedAt: 'asc' },
      })
    : [];
  const subWithFiles = new Set(allFiles.map((f) => f.targetId));
  // 委員/觀察員可見:機關區(技術檢測/實地稽核)看中心已「確認齊備」者;中心匯入區看已有檔案者
  const isAuditor = user.role === 'AUDITOR';
  const isObserver = user.role === 'OBSERVER';
  const isReviewer = isAuditor || isObserver; // 唯讀檢視者(觀察員批30 比照委員待遇,窗口各查各的)
  // 審閱時間區間(UAT 批67;觀察員批30 用獨立窗口):不在窗口內(或未設)→ 顯鎖定卡,不渲染機關資料
  const reviewState = reviewWindowStateForRole(user.role as Role, cycle);
  const reviewLocked = reviewState !== 'open';
  const visibleRequirements = isReviewer
    ? requirements.filter(
        (r) => !!r.submission && auditorCanSeePrep(r.submission.status, r.category, subWithFiles.has(r.submission.id), cycle.status),
      )
    : user.role === 'ORG_ADMIN'
      ? requirements.filter((r) => r.category !== 'CENTER') // 中心匯入區僅供委員審閱,機關不顯示
      : requirements;
  const visibleSubIds = new Set(visibleRequirements.map((r) => r.submission?.id).filter(Boolean));
  const files = allFiles.filter((f) => visibleSubIds.has(f.targetId));

  const yearROC = cycle.year - 1911;
  // 文件範本(中心於標準清單維護,依週期年度解析):機關/中心可整包下載依式填寫;委員不需要
  const templateFiles = isReviewer ? [] : await getTemplateFilesForYear(cycle.year);
  // 機關管理員只負責機關區(技術檢測 / 實地稽核);中心匯入由中心經手,不計入機關的「已確認齊備 X/Y」分母。
  const countReqs = user.role === 'ORG_ADMIN' ? requirements.filter((r) => r.category !== 'CENTER') : requirements;
  const total = countReqs.length;
  const confirmed = countReqs.filter((r) => r.submission?.status === 'CONFIRMED').length;
  const submittedN = countReqs.filter((r) => r.submission?.status === 'SUBMITTED').length;
  const pendingN = Math.max(0, total - confirmed - submittedN);

  // 左側「稽核作業項目」導覽:與週期頁四模組卡同一單一來源(lib/cycle-modules,減法批 dup#6/roles#7),
  // 只是側欄列版面;不再自算一套 auditStatus/defTotal 造成兩頁平行漂移。
  // 缺失讀數:委員限「指派給本人審閱」者(對齊批66 reviewer-aware;原 defTotal 全量計數對委員過報)。
  const defs = await prisma.deficiency.findMany({
    where: { cycleId: cycle.id },
    select: { reviewerAuditorId: true, action: { select: { status: true } } },
  });
  const myDefs = isAuditor ? defs.filter((d) => d.reviewerAuditorId === user.id) : defs;
  // 師徒制(批30):委員視角帶「本人指導的觀察員數」(>0 顯示指導卡);中心帶配對數(顯示觀察員窗口設定)
  const mentorObservers = isAuditor
    ? await prisma.cycleObserver.count({ where: { cycleId: cycle.id, mentorId: user.id } })
    : 0;
  const observerCount = user.role === 'SUPER_ADMIN'
    ? await prisma.cycleObserver.count({ where: { cycleId: cycle.id } })
    : 0;
  const defPassed = myDefs.filter((d) => d.action?.status === 'PASSED').length;
  const defReturned = myDefs.filter((d) => d.action?.status === 'RETURNED').length;
  const defSubmitted = myDefs.filter((d) => d.action?.status === 'SUBMITTED').length;
  // 檢核表填答數(與 deriveCycleFacts 同規則:compliance 非空即已答)
  const checklistAnswered = await prisma.checklistResponse.count({
    where: { cycleId: cycle.id, compliance: { not: null } },
  });
  const checklistTotal = cycle.checklistVersion?._count?.items ?? 0;
  // 資料準備細分(與 facts 同語意:UPLOADED=待繳、INSUFFICIENT=退補)
  const reqStatuses = countReqs.map((r) => r.submission?.status ?? 'EMPTY');
  const modules = buildModuleNav({
    cycleId: cycle.id,
    role: user.role as Role,
    status: cycle.status as CycleStatus,
    prep: {
      confirmed,
      total,
      draft: reqStatuses.filter((s) => s === 'UPLOADED').length,
      insufficient: reqStatuses.filter((s) => s === 'INSUFFICIENT').length,
    },
    checklist: { submitted: Boolean(cycle.checklistSubmittedAt), answered: checklistAnswered, total: checklistTotal },
    def: {
      total: myDefs.length,
      passed: defPassed,
      pending: myDefs.length - defPassed - defReturned - defSubmitted,
      returned: defReturned,
    },
    report: {
      submitted: cycle.signedReports.some((r) => r.submittedAt),
      confirmed: cycle.signedReports.some((r) => r.confirmedAt),
    },
    auditorReviewState: isAuditor ? reviewState : undefined,
    observerReviewState: isObserver ? reviewState : undefined,
    mentorObservers: isAuditor ? mentorObservers : undefined,
  });
  const MODULE_ICONS: Record<string, React.ReactNode> = {
    prep: <FileText size={18} />,
    checklist: <ClipboardCheck size={18} />,
    audit: <Eye size={18} />,
    def: <AlertTriangle size={18} />,
    report: <CheckCircle size={18} />,
    practice: <Pencil size={18} />,
  };

  return (
    <AppShell
      user={{ name: user.name, email: user.email, role: user.role, organizationName: user.organizationName }}
      cycleId={cycle.id}
      watermark
      crumbs={[
        { label: '總覽', href: '/dashboard' },
        { label: '稽核週期', href: '/cycles' },
        { label: `${yearROC} 年度 · ${cycle.organization.name}`, href: `/cycles/${cycle.id}` },
        { label: '稽核前資料準備' },
      ]}
    >
      <CycleHubBar
        cycleId={cycle.id}
        label={`${yearROC} 年度 · ${cycle.organization.shortName ?? cycle.organization.name}`}
        nextHint="繳交後於工作台確認齊備、查看下一步"
      />

      {/* master-detail:左=稽核作業項目導覽;右=稽核前資料準備明細 */}
      <div className="lg:grid lg:grid-cols-[224px_minmax(0,1fr)] lg:gap-6 lg:items-start">
        <aside className="mb-5 lg:mb-0 lg:sticky lg:top-6">
          <div className="rounded-lg border border-rule bg-card p-2">
            <p className="px-2 py-1.5 text-label-sm font-medium uppercase tracking-[0.08em] text-ink-500">稽核作業項目</p>
            <div className="flex flex-col gap-0.5">
              {/* 批33 圖1:prep 工作區左欄只列「本工作區」——稽核前資料準備 + 其檢核表子項;
                  其他模組(進階設定/實地稽核/缺失)由頂部「回週期工作台」進入,不在此重列造成噪音。 */}
              {modules.filter((m) => m.key === 'prep').flatMap((m) => [m, ...modules.filter((x) => x.childOf === 'prep')]).map((m) => {
                const isChild = Boolean(m.childOf);
                const isCurrent = m.key === 'prep';
                const locked = m.locked && !isCurrent;
                const inner = (
                  <div className={`flex items-center gap-2.5 rounded-md px-2.5 py-2.5 ${isChild ? 'ml-5 border-l-2 border-rule pl-2.5' : ''} ${isCurrent ? 'bg-focus-wash border border-primary-100' : locked ? 'opacity-70' : 'transition-colors hover:bg-paper-sunk'}`}>
                    <TileIcon size={isChild ? 26 : 32} className={isCurrent ? 'bg-card text-primary-700' : 'bg-paper-sunk text-ink-500'}>
                      {MODULE_ICONS[m.key]}
                    </TileIcon>
                    <div className="min-w-0 flex-1">
                      <p className={`text-body-sm font-medium leading-tight ${isCurrent ? 'text-primary-700' : locked ? 'text-ink-500' : 'text-ink-900'}`}>{m.title}</p>
                      <p className="mt-0.5 text-caption text-ink-500 leading-tight">{m.sub}</p>
                      <StatusPill tone={m.statusTone === 'default' ? 'neutral' : m.statusTone} className="mt-1">{m.status}</StatusPill>
                    </div>
                    {locked
                      ? <EyeOff size={15} className="shrink-0 text-ink-400" aria-label="尚未開放" />
                      : !isCurrent && <ChevronRight size={16} className="shrink-0 text-ink-500 transition-transform group-hover:translate-x-0.5" />}
                  </div>
                );
                if (locked) {
                  return <LockedNavItem key={m.key} title="尚未開放" message={m.lockedHint ?? '此頁面尚未開放。'}>{inner}</LockedNavItem>;
                }
                return isCurrent
                  ? <div key={m.key} aria-current="page">{inner}</div>
                  : <Link key={m.key} href={m.href} className="group block focus-ring rounded-md">{inner}</Link>;
              })}
            </div>
          </div>
        </aside>

        <div className="min-w-0">
          <header className="mb-5">
            <h1 className="text-headline text-ink-900">稽核前資料準備</h1>
            <p className="mt-1 text-body-sm text-ink-500">
              {yearROC} 年度 · {cycle.organization.name}
              {cycle.prepDueDate && <> · 截止 {fmtROC(cycle.prepDueDate)}</>}
            </p>
          </header>

          {/* 委員審閱時間區間設定(中心):設定委員可檢視資料準備+檢核表審閱的開放時段;未設不開放 */}
          {user.role === 'SUPER_ADMIN' && (
            <ReviewWindowSetting
              cycleId={cycle.id}
              initialStart={cycle.reviewWindowStart ? isoDate(cycle.reviewWindowStart) : null}
              initialEnd={cycle.reviewWindowEnd ? isoDate(cycle.reviewWindowEnd) : null}
            />
          )}
          {/* 觀察員獨立審閱窗口(批30 需求一-1):僅本週期有配對觀察員時顯示,避免無觀察員時多一塊噪音 */}
          {user.role === 'SUPER_ADMIN' && observerCount > 0 && (
            <ReviewWindowSetting
              variant="observer"
              cycleId={cycle.id}
              initialStart={cycle.observerWindowStart ? isoDate(cycle.observerWindowStart) : null}
              initialEnd={cycle.observerWindowEnd ? isoDate(cycle.observerWindowEnd) : null}
            />
          )}

          {/* 文件範本:中心提供之應備文件空白範本(Word/Excel 等),下載依式填寫後轉 PDF 上傳 */}
          {!isReviewer && templateFiles.length > 0 && (
            <div className={`mb-5 flex flex-wrap items-center justify-between gap-3 rounded-lg ${SURFACE_INFO} px-4 py-3.5`}>
              <div className="min-w-0">
                <p className="text-body-sm font-medium text-ink-900">文件範本({templateFiles.length} 檔)</p>
                <p className="mt-0.5 text-caption text-ink-500 leading-relaxed">
                  中心提供之應備文件範本(Word/Excel 等);請下載依式填寫,完成後轉存 PDF 再上傳對應項目。
                </p>
              </div>
              <a href={`/api/cycles/${cycle.id}/prep/templates`} className="shrink-0">
                <Button size="sm" variant="tonal" leadingIcon={<Download size={15} />}>整包下載(zip)</Button>
              </a>
            </div>
          )}

          {/* 完成時刻:全數確認齊備時以完成卡取代讀數格,給承辦人明確的「做完了」儀式感 */}
          {!isReviewer && total > 0 && confirmed === total && (
            <div className="mb-5 flex items-center gap-3.5 rounded-lg border border-success-100 bg-success-50 px-4 py-3.5">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-success-600 text-white">
                <Check size={20} />
              </span>
              <div className="min-w-0">
                <p className="text-title text-success-700">資料全數確認齊備</p>
                <p className="mt-0.5 text-caption text-ink-500">{total} 項應備資料皆已由中心確認完成;請回工作台查看下一步。</p>
              </div>
            </div>
          )}

          {/* 摘要統計(機關/中心):附件處理概況一目了然 */}
          {!isReviewer && total > 0 && confirmed !== total && (
            <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
              {[
                { label: '要求項目', value: `${total}`, tone: '' },
                { label: '已確認齊備', value: `${confirmed}`, tone: 'text-success-700' },
                { label: '審核中', value: `${submittedN}`, tone: '' },
                { label: '待補正/未繳', value: `${pendingN}`, tone: pendingN > 0 ? 'text-warning-700' : '' },
              ].map((s) => (
                <div key={s.label} className="rounded-lg border border-rule bg-card px-4 py-3">
                  <p className="text-caption text-ink-500">{s.label}</p>
                  <p className={`mt-1 text-headline-sm font-medium tabular-nums leading-none ${s.tone}`}>{s.value}</p>
                </div>
              ))}
            </div>
          )}
          {isReviewer && !reviewLocked && total > 0 && (
            <p className="mb-4 text-caption text-ink-500">
              僅顯示已開放委員檢視之資料(目前 {confirmed} / {total} 項已確認齊備)。
            </p>
          )}

          {isReviewer && reviewLocked ? (
            // 審閱時間區間閘(UAT 批67):不在窗口內→顯鎖定卡,不渲染任何機關資料
            <ReviewWindowLockNotice state={reviewState} start={isObserver ? cycle.observerWindowStart : cycle.reviewWindowStart} end={isObserver ? cycle.observerWindowEnd : cycle.reviewWindowEnd} stageEnded={onsiteStageEnded(cycle.status)} cycleId={cycle.id} roleNoun={isObserver ? '觀察員' : '委員'} />
          ) : isReviewer && visibleRequirements.length === 0 ? (
            <div className="rounded-lg border border-rule bg-paper-sunk p-8 text-center text-body-sm text-ink-500">
              目前暫無可檢視項目。待週期進入「資料齊備」階段後,中心已確認齊備之資料才會對委員開放於此。
            </div>
          ) : (
            <PrepBoard
              cycleId={cycle.id}
              role={user.role}
              cycleStatus={cycle.status}
              prepDueOnsiteISO={cycle.prepDueDate ? cycle.prepDueDate.toISOString() : null}
              prepDueTechISO={cycle.prepDueTech ? cycle.prepDueTech.toISOString() : null}
              initialItems={visibleRequirements.map((r) => ({
                id: r.id,
                title: r.title,
                description: r.description,
                required: r.required,
                category: r.category,
                submission: r.submission
                  ? {
                      id: r.submission.id,
                      status: r.submission.status,
                      note: r.submission.note,
                      noFileReason: r.submission.noFileReason,
                      reviewNote: r.submission.reviewNote,
                      submittedAt: r.submission.submittedAt ? r.submission.submittedAt.toISOString() : null,
                    }
                  : null,
              }))}
              initialFiles={files.map((f) => ({
                id: f.id,
                targetId: f.targetId,
                originalName: f.originalName,
                sizeBytes: f.sizeBytes,
              }))}
            />
          )}
        </div>
      </div>
    </AppShell>
  );
}
