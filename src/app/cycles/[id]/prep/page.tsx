import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { prisma } from '@/lib/db';
import { auth } from '@/lib/auth';
import { fmtROC } from '@/lib/date';
import { auditorCanSeePrep, auditorCanSeeCycle, type Role } from '@/lib/types';
import { canAccess } from '@/lib/access-policy';
import { AppShell } from '@/components/shell/AppShell';
import { CycleHubBar } from '@/components/cycle/CycleHubBar';
import { Button } from '@/components/ui/Button';
import { FileText, ClipboardCheck, Eye, AlertTriangle, ChevronRight, Check, Download } from '@/components/icons';
import { getTemplateFilesForYear } from '@/lib/prep-standard';
import PrepBoard from './PrepBoard';

export default async function PrepPage({ params }: { params: { id: string } }) {
  const session = await auth();
  if (!session) redirect(`/login?callbackUrl=/cycles/${params.id}/prep`);
  const user = session.user;

  const cycle = await prisma.auditCycle.findUnique({
    where: { id: params.id },
    include: { organization: true, assignments: true },
  });
  if (!cycle) notFound();
  if (user.role === 'ORG_ADMIN' && cycle.organizationId !== user.organizationId) redirect('/dashboard');
  // 委員:未指派或週期仍開立中(DRAFT) → 導回(對齊 access-policy 'cycle.access')
  if (user.role === 'AUDITOR' && (!cycle.assignments.some((a) => a.auditorId === user.id) || !auditorCanSeeCycle(cycle.status))) redirect('/dashboard');

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
  // 委員可見:機關區(技術檢測/實地稽核)看中心已「確認齊備」者;中心匯入區看已有檔案者
  const isAuditor = user.role === 'AUDITOR';
  const visibleRequirements = isAuditor
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
  const templateFiles = isAuditor ? [] : await getTemplateFilesForYear(cycle.year);
  // 機關管理員只負責機關區(技術檢測 / 實地稽核);中心匯入由中心經手,不計入機關的「已確認齊備 X/Y」分母。
  const countReqs = user.role === 'ORG_ADMIN' ? requirements.filter((r) => r.category !== 'CENTER') : requirements;
  const total = countReqs.length;
  const confirmed = countReqs.filter((r) => r.submission?.status === 'CONFIRMED').length;
  const submittedN = countReqs.filter((r) => r.submission?.status === 'SUBMITTED').length;
  const pendingN = Math.max(0, total - confirmed - submittedN);

  // 左側「稽核作業項目」導覽(master-detail):跳往同週期其他作業,附狀態
  const st = cycle.status;
  const onsitePast = st === 'REPORT_ISSUED' || st === 'REMEDIATION' || st === 'CLOSED';
  const auditStatus = onsitePast ? '已完成' : (st === 'ONSITE' ? '進行中' : '尚未開始');
  const defTotal = await prisma.deficiency.count({ where: { cycleId: cycle.id } });
  const base = `/cycles/${cycle.id}`;
  type Nav = { key: string; label: string; sub: string; href: string | null; status: string; statusTone: 'success' | 'neutral'; icon: React.ReactNode };
  const navItems: (Nav & { show: boolean })[] = [
    { key: 'prep', label: '稽核前資料準備', sub: '附件收集與繳交', href: null, status: total > 0 ? `${confirmed}/${total}` : '—', statusTone: total > 0 && confirmed === total ? 'success' : 'neutral', icon: <FileText size={18} />, show: true },
    { key: 'checklist', label: '資通安全檢核表', sub: isAuditor ? '委員審閱' : '機關自評與佐證', href: isAuditor ? `${base}/review` : `${base}/checklist`, status: cycle.checklistSubmittedAt ? '已送出' : (isAuditor ? '審閱' : '填報中'), statusTone: cycle.checklistSubmittedAt ? 'success' : 'neutral', icon: <ClipboardCheck size={18} />, show: true },
    { key: 'audit', label: '實地稽核評分', sub: '委員評分與發現', href: `${base}/audit`, status: auditStatus, statusTone: 'neutral', icon: <Eye size={18} />, show: user.role !== 'ORG_ADMIN' },
    { key: 'def', label: '缺失與矯正管考', sub: '缺失通知、改善', href: `${base}/deficiencies`, status: defTotal > 0 ? `${defTotal} 項` : '未發布', statusTone: 'neutral', icon: <AlertTriangle size={18} />, show: user.role === 'SUPER_ADMIN' || canAccess('deficiencies.view', user.role as Role, cycle.status) },
  ];
  const shownNav = navItems.filter((n) => n.show);

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
          <div className="rounded-lg border border-outline-variant/60 bg-surface p-2">
            <p className="px-2 py-1.5 text-label-sm font-medium uppercase tracking-[0.08em] text-on-surface-variant">稽核作業項目</p>
            <div className="flex flex-col gap-0.5">
              {shownNav.map((n) => {
                const inner = (
                  <div className={`flex items-center gap-2.5 rounded-md px-2.5 py-2.5 ${n.href === null ? 'bg-primary-50 border border-primary-100' : 'transition-colors hover:bg-surface-container'}`}>
                    <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-md ${n.href === null ? 'bg-white text-primary-700' : 'bg-surface-container text-on-surface-variant'}`}>
                      {n.icon}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className={`text-body-sm font-medium leading-tight ${n.href === null ? 'text-primary-800' : 'text-on-surface'}`}>{n.label}</p>
                      <p className="mt-0.5 text-caption text-on-surface-variant leading-tight">{n.sub}</p>
                      <span className={`mt-1 inline-block rounded-full px-1.5 text-label-sm ${n.statusTone === 'success' ? 'bg-success-50 text-success-700' : 'bg-surface-container text-on-surface-variant'}`}>{n.status}</span>
                    </div>
                    {n.href !== null && <ChevronRight size={16} className="shrink-0 text-on-surface-variant transition-transform group-hover:translate-x-0.5" />}
                  </div>
                );
                return n.href === null
                  ? <div key={n.key} aria-current="page">{inner}</div>
                  : <Link key={n.key} href={n.href} className="group block focus-ring rounded-md">{inner}</Link>;
              })}
            </div>
          </div>
        </aside>

        <div className="min-w-0">
          <header className="mb-5">
            <h1 className="text-headline text-on-surface">稽核前資料準備</h1>
            <p className="mt-1 text-body-sm text-on-surface-variant">
              {yearROC} 年度 · {cycle.organization.name}
              {cycle.prepDueDate && <> · 截止 {fmtROC(cycle.prepDueDate)}</>}
            </p>
          </header>

          {/* 文件範本:中心提供之應備文件空白範本(Word/Excel 等),下載依式填寫後轉 PDF 上傳 */}
          {!isAuditor && templateFiles.length > 0 && (
            <div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-primary-100 bg-primary-50/50 px-4 py-3.5">
              <div className="min-w-0">
                <p className="text-body-sm font-medium text-on-surface">文件範本({templateFiles.length} 檔)</p>
                <p className="mt-0.5 text-caption text-on-surface-variant leading-relaxed">
                  中心提供之應備文件範本(Word/Excel 等);請下載依式填寫,完成後轉存 PDF 再上傳對應項目。
                </p>
              </div>
              <a href={`/api/cycles/${cycle.id}/prep/templates`} className="shrink-0">
                <Button size="sm" variant="tonal" leadingIcon={<Download size={15} />}>整包下載(zip)</Button>
              </a>
            </div>
          )}

          {/* 完成時刻:全數確認齊備時以完成卡取代讀數格,給承辦人明確的「做完了」儀式感 */}
          {!isAuditor && total > 0 && confirmed === total && (
            <div className="mb-5 flex items-center gap-3.5 rounded-lg border border-success-100 bg-success-50 px-4 py-3.5">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-success-600 text-white">
                <Check size={20} />
              </span>
              <div className="min-w-0">
                <p className="text-title text-success-700">資料全數確認齊備</p>
                <p className="mt-0.5 text-caption text-on-surface-variant">{total} 項應備資料皆已由中心確認完成;請回工作台查看下一步。</p>
              </div>
            </div>
          )}

          {/* 摘要統計(機關/中心):附件處理概況一目了然 */}
          {!isAuditor && total > 0 && confirmed !== total && (
            <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
              {[
                { label: '要求項目', value: `${total}`, tone: '' },
                { label: '已確認齊備', value: `${confirmed}`, tone: 'text-success-700' },
                { label: '審核中', value: `${submittedN}`, tone: '' },
                { label: '待補正/未繳', value: `${pendingN}`, tone: pendingN > 0 ? 'text-amber-600' : '' },
              ].map((s) => (
                <div key={s.label} className="rounded-lg border border-outline-variant/60 bg-surface px-4 py-3">
                  <p className="text-caption text-on-surface-variant">{s.label}</p>
                  <p className={`mt-1 text-headline-sm font-medium tabular-nums leading-none ${s.tone}`}>{s.value}</p>
                </div>
              ))}
            </div>
          )}
          {isAuditor && total > 0 && (
            <p className="mb-4 text-caption text-on-surface-variant">
              僅顯示已開放委員檢視之資料(目前 {confirmed} / {total} 項已確認齊備)。
            </p>
          )}

          {isAuditor && visibleRequirements.length === 0 ? (
            <div className="rounded-lg border border-outline-variant/60 bg-surface-container-low p-8 text-center text-body-sm text-on-surface-variant">
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
