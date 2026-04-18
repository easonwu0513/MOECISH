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
      checklistVersion: { include: { items: { orderBy: { orderIndex: 'asc' } } } },
      responses: { include: { comments: { orderBy: { createdAt: 'asc' } } } },
    },
  });
  if (!cycle) notFound();

  if (
    (user.role === 'RESPONDENT' || user.role === 'SUPERVISOR') &&
    cycle.organizationId !== user.organizationId
  ) {
    redirect('/');
  }

  const canEdit =
    (user.role === 'RESPONDENT' || user.role === 'SUPERVISOR') &&
    (cycle.status === 'DRAFT' || cycle.status === 'COMMENTS_RETURNED');

  const items = cycle.checklistVersion.items.map((i) => ({
    id: i.id,
    itemNo: i.itemNo,
    content: i.content,
    dimension: i.dimension as Dimension,
    orderIndex: i.orderIndex,
  }));

  const responses = cycle.responses.map((r) => ({
    id: r.id,
    checklistItemId: r.checklistItemId,
    compliance: r.compliance as ('COMPLIANT' | 'PARTIALLY_COMPLIANT' | 'NON_COMPLIANT' | 'NOT_APPLICABLE' | null),
    description: r.description,
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
        { label: '總覽', href: '/' },
        { label: `${cycle.year - 1911} 年度`, href: `/cycles/${cycle.id}` },
        { label: '模組一 · 檢核表' },
      ]}
    >
      <header className="mb-5">
        <h1 className="text-headline text-neutral-900">模組一　檢核表填報</h1>
        <p className="text-body-sm text-neutral-500 mt-1">
          {cycle.organization.name} · 共 {cycle.checklistVersion.items.length} 題 ·{' '}
          {canEdit ? '填寫中' : `目前狀態不可編輯（${cycle.status}）`}
        </p>
      </header>

      <ChecklistShell
        cycleId={cycle.id}
        items={items}
        responses={responses}
        canEdit={canEdit}
        userRole={user.role}
      />
    </AppShell>
  );
}
