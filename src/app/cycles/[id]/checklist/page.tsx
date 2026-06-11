import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { prisma } from '@/lib/db';
import { auth } from '@/lib/auth';
import { AppShell } from '@/components/shell/AppShell';
import type { Dimension } from '@/lib/types';
import ChecklistShell from './ChecklistShell';

export default async function ChecklistPage({ params }: { params: { id: string } }) {
  const session = await auth();
  if (!session) redirect(`/login?callbackUrl=/cycles/${params.id}/checklist`);
  const user = session.user;

  const cycle = await prisma.auditCycle.findUnique({
    where: { id: params.id },
    include: {
      organization: true,
      assignments: true,
      checklistVersion: { include: { items: { orderBy: { orderIndex: 'asc' } } } },
      responses: { include: { comments: { orderBy: { createdAt: 'asc' } } } },
    },
  });
  if (!cycle) notFound();

  if (
    user.role === 'ORG_ADMIN' &&
    cycle.organizationId !== user.organizationId
  ) {
    redirect('/dashboard');
  }
  // 委員僅能進入被指派的週期(與審閱頁/API 同一道隔離)
  if (
    user.role === 'AUDITOR' &&
    !cycle.assignments.some((a) => a.auditorId === user.id)
  ) {
    redirect('/dashboard');
  }

  const submitted = Boolean(cycle.checklistSubmittedAt);
  const canEdit =
    user.role === 'ORG_ADMIN' &&
    (cycle.status === 'DRAFT' || cycle.status === 'PREPARATION') &&
    !submitted;
  const canSubmit =
    user.role === 'ORG_ADMIN' &&
    (cycle.status === 'DRAFT' || cycle.status === 'PREPARATION');
  const canReopen = user.role === 'AUDITOR' || user.role === 'SUPER_ADMIN';

  const items = cycle.checklistVersion.items.map((i) => ({
    id: i.id,
    itemNo: i.itemNo,
    content: i.content,
    dimension: i.dimension as Dimension,
    orderIndex: i.orderIndex,
    auditBasis: i.auditBasis,
    auditFocus: i.auditFocus,
    expectedEvidence: i.expectedEvidence,
  }));

  const responses = cycle.responses.map((r) => ({
    id: r.id,
    checklistItemId: r.checklistItemId,
    compliance: r.compliance as ('COMPLIANT' | 'PARTIALLY_COMPLIANT' | 'NON_COMPLIANT' | 'NOT_APPLICABLE' | null),
    description: r.description,
    recordDocs: r.recordDocs,
    version: r.version,
    comments: r.comments.map((c) => ({
      id: c.id,
      content: c.content,
      round: c.round,
      resolvedAt: c.resolvedAt,
      createdAt: c.createdAt,
    })),
  }));

  return (
    <AppShell
      user={{
        name: user.name,
        email: user.email,
        role: user.role,
        organizationName: user.organizationName,
      }}
      cycleId={cycle.id}
      crumbs={[
        { label: '總覽', href: '/dashboard' },
        { label: `${cycle.year - 1911} 年度`, href: `/cycles/${cycle.id}` },
        { label: '檢核表填報' },
      ]}
    >
      <header className="mb-5">
        <h1 className="text-headline text-neutral-900">資通安全檢核表填報</h1>
        <p className="text-body-sm text-neutral-500 mt-1">
          {cycle.organization.name} · {cycle.checklistVersion.name} · 共 {cycle.checklistVersion.items.length} 題 ·{' '}
          {canEdit
            ? '填寫中(每題可展開「法規對照」查看稽核依據與應備文件)'
            : submitted
              ? '已送出鎖定'
              : '目前狀態為唯讀'}
        </p>
      </header>

      <ChecklistShell
        cycleId={cycle.id}
        items={items}
        responses={responses}
        canEdit={canEdit}
        userRole={user.role}
        canSubmit={canSubmit}
        canReopen={canReopen}
        submittedAtISO={cycle.checklistSubmittedAt?.toISOString() ?? null}
        submittedBy={cycle.checklistSubmittedBy}
        reopenNote={cycle.checklistReopenNote}
      />
    </AppShell>
  );
}
