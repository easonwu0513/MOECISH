import { notFound, redirect } from 'next/navigation';
import { prisma } from '@/lib/db';
import { auth } from '@/lib/auth';
import { fmtROC } from '@/lib/date';
import { auditorCanSeePrep } from '@/lib/types';
import { AppShell } from '@/components/shell/AppShell';
import { ProgressBar } from '@/components/ui/ProgressBar';
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
  if (user.role === 'AUDITOR' && !cycle.assignments.some((a) => a.auditorId === user.id)) redirect('/dashboard');

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
        (r) => !!r.submission && auditorCanSeePrep(r.submission.status, r.category, subWithFiles.has(r.submission.id)),
      )
    : requirements;
  const visibleSubIds = new Set(visibleRequirements.map((r) => r.submission?.id).filter(Boolean));
  const files = allFiles.filter((f) => visibleSubIds.has(f.targetId));

  const yearROC = cycle.year - 1911;
  const total = requirements.length;
  const confirmed = requirements.filter((r) => r.submission?.status === 'CONFIRMED').length;

  return (
    <AppShell
      user={{ name: user.name, email: user.email, role: user.role, organizationName: user.organizationName }}
      cycleId={cycle.id}
      crumbs={[
        { label: '總覽', href: '/dashboard' },
        { label: '稽核週期', href: '/cycles' },
        { label: `${yearROC} 年度 · ${cycle.organization.name}`, href: `/cycles/${cycle.id}` },
        { label: '稽核前資料準備' },
      ]}
    >
      <header className="mb-6">
        <h1 className="text-headline text-on-surface">稽核前資料準備</h1>
        <p className="mt-1 text-body-sm text-on-surface-variant">
          {yearROC} 年度 · {cycle.organization.name}
          {cycle.prepDueDate && <> · 截止 {fmtROC(cycle.prepDueDate)}</>}
        </p>
        {isAuditor
          ? total > 0 && (
              <p className="mt-3 text-caption text-on-surface-variant">
                僅顯示中心已確認齊備、開放委員檢視之資料(目前 {confirmed} / {total} 項已確認)。
              </p>
            )
          : total > 0 && (
              <div className="mt-4 max-w-md">
                <ProgressBar value={confirmed} max={total} tone="primary" size="sm" />
                <p className="mt-1.5 text-caption text-on-surface-variant">
                  已確認齊備 <span className="tabular-nums font-medium text-on-surface">{confirmed}</span> / {total} 項
                </p>
              </div>
            )}
      </header>

      {isAuditor && visibleRequirements.length === 0 ? (
        <div className="rounded-xl border border-outline-variant bg-surface-container-low p-8 text-center text-body-sm text-on-surface-variant">
          中心尚未確認齊備任何資料,暫無可檢視項目。待中心逐項確認齊備後即會開放於此。
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
    </AppShell>
  );
}
