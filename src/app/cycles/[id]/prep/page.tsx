import { notFound, redirect } from 'next/navigation';
import { prisma } from '@/lib/db';
import { auth } from '@/lib/auth';
import { fmtROC } from '@/lib/date';
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
  const subIds = requirements.map((r) => r.submission?.id).filter(Boolean) as string[];
  const files = subIds.length
    ? await prisma.evidence.findMany({
        where: { targetType: 'PREP_SUBMISSION', targetId: { in: subIds } },
        select: { id: true, targetId: true, originalName: true, sizeBytes: true },
        orderBy: { uploadedAt: 'asc' },
      })
    : [];

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
        {total > 0 && (
          <div className="mt-4 max-w-md">
            <ProgressBar value={confirmed} max={total} tone="primary" size="sm" />
            <p className="mt-1.5 text-caption text-on-surface-variant">
              委員已確認 <span className="tabular-nums font-medium text-on-surface">{confirmed}</span> / {total} 項
            </p>
          </div>
        )}
      </header>

      <PrepBoard
        cycleId={cycle.id}
        role={user.role}
        cycleStatus={cycle.status}
        initialItems={requirements.map((r) => ({
          id: r.id,
          title: r.title,
          description: r.description,
          required: r.required,
          submission: r.submission
            ? {
                id: r.submission.id,
                status: r.submission.status,
                note: r.submission.note,
                reviewNote: r.submission.reviewNote,
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
    </AppShell>
  );
}
