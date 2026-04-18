import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { prisma } from '@/lib/db';
import { auth } from '@/lib/auth';
import { DIMENSION_LABELS, DIMENSION_ORDER } from '@/lib/dimension';
import type { Dimension } from '@/lib/types';
import ChecklistItemRow from './ChecklistItemRow';

export default async function ChecklistPage({ params }: { params: { id: string } }) {
  const session = await auth();
  if (!session) redirect(`/login?callbackUrl=/cycles/${params.id}/checklist`);
  const user = session.user;

  const cycle = await prisma.auditCycle.findUnique({
    where: { id: params.id },
    include: {
      organization: true,
      checklistVersion: {
        include: { items: { orderBy: { orderIndex: 'asc' } } },
      },
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

  const responsesByItem = new Map(cycle.responses.map((r) => [r.checklistItemId, r]));

  const grouped = DIMENSION_ORDER.map((dim) => ({
    dim,
    items: cycle.checklistVersion.items.filter((i) => i.dimension === dim),
  }));

  return (
    <div className="max-w-6xl mx-auto px-6 py-8">
      <header className="mb-6">
        <Link href={`/cycles/${cycle.id}`} className="text-sm text-slate-500 hover:text-brand-600">← 回稽核週期</Link>
        <h1 className="mt-2 text-2xl font-bold text-brand-700">模組一　檢核表填報</h1>
        <p className="text-sm text-slate-600 mt-1">
          {cycle.organization.name} · {cycle.year - 1911} 年度 · 共 {cycle.checklistVersion.items.length} 題
          {canEdit ? '' : ' · 目前不可編輯（狀態為 ' + cycle.status + '）'}
        </p>
      </header>

      {grouped.map(({ dim, items }) => (
        <section key={dim} className="mb-8">
          <h2 className="text-lg font-semibold text-brand-700 mb-3 border-l-4 border-brand-500 pl-3">
            {DIMENSION_LABELS[dim as Dimension]}（{items.length} 題）
          </h2>
          <div className="space-y-3">
            {items.map((item) => (
              <ChecklistItemRow
                key={item.id}
                cycleId={cycle.id}
                item={item}
                response={responsesByItem.get(item.id) ?? null}
                canEdit={canEdit}
                userRole={user.role}
              />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
