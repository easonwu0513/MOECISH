import { notFound, redirect } from 'next/navigation';
import { prisma } from '@/lib/db';
import { auth } from '@/lib/auth';
import { AppShell } from '@/components/shell/AppShell';
import { Card } from '@/components/ui/Card';
import { Chip } from '@/components/ui/Chip';
import { DIMENSION_LABELS, DIMENSION_ORDER } from '@/lib/dimension';
import type { Dimension } from '@/lib/types';
import { ItemActions, AddItemButton } from './ItemEditor';

export const dynamic = 'force-dynamic';

/** 題庫版本內容編輯:逐構面列出 87 項,編輯題文與法規對照(SUPER_ADMIN)。 */
export default async function ChecklistVersionDetailPage({ params }: { params: { id: string } }) {
  const session = await auth();
  if (!session) redirect(`/login?callbackUrl=/admin/checklists/${params.id}`);
  if (session.user.role !== 'SUPER_ADMIN') redirect('/dashboard');
  const user = session.user;

  const version = await prisma.checklistVersion.findUnique({
    where: { id: params.id },
    include: {
      items: {
        orderBy: { orderIndex: 'asc' },
        include: { _count: { select: { responses: true } } },
      },
      _count: { select: { cycles: true } },
    },
  });
  if (!version) notFound();

  const withLaw = version.items.filter((i) => i.auditBasis).length;
  const grouped = DIMENSION_ORDER.map((dim) => ({
    dim,
    items: version.items.filter((i) => i.dimension === dim),
  })).filter((g) => g.items.length > 0);

  return (
    <AppShell
      user={{ name: user.name, email: user.email, role: user.role, organizationName: user.organizationName }}
      crumbs={[
        { label: '管理', href: '/admin/organizations' },
        { label: '檢核表題庫', href: '/admin/checklists' },
        { label: version.name },
      ]}
    >
      <header className="mb-6 flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-headline text-ink-900">{version.name}</h1>
            {version.isActive
              ? <Chip size="sm" tone="success" dot>啟用中</Chip>
              : <Chip size="sm" tone="neutral">停用</Chip>}
          </div>
          <p className="mt-1 text-body-sm text-ink-500">
            {version.year - 1911} 年度 · 共 {version.items.length} 題 ·
            法規對照已建 <span className="tabular-nums font-medium text-ink-900">{withLaw}</span> 題
            {withLaw < version.items.length && (
              <span className="text-warning-700">(尚有 {version.items.length - withLaw} 題待補,點「編輯」填入)</span>
            )}
            {version._count.cycles > 0 && <> · {version._count.cycles} 個週期使用中</>}
          </p>
        </div>
        <AddItemButton versionId={version.id} />
      </header>

      {grouped.map(({ dim, items }) => (
        <section key={dim} className="mb-6">
          <h2 className="text-title text-ink-900 mb-3">{DIMENSION_LABELS[dim as Dimension]}</h2>
          <Card padded={false} variant="outlined">
            <ul className="divide-y divide-rule">
              {items.map((it) => (
                <li key={it.id} className="flex items-start gap-3 px-4 py-3.5 hover:bg-paper-sunk transition-colors">
                  <Chip tone="neutral" size="sm" className="font-mono shrink-0 mt-0.5">{it.itemNo}</Chip>
                  <div className="flex-1 min-w-0">
                    <p className="text-body-sm text-ink-900 leading-relaxed line-clamp-2">{it.content}</p>
                    <div className="mt-1 flex items-center gap-1.5 flex-wrap">
                      {it.auditBasis
                        ? <Chip size="sm" tone="success">法規對照 ✓</Chip>
                        : <Chip size="sm" tone="warning">法規對照待補</Chip>}
                      {it._count.responses > 0 && (
                        <span className="text-caption text-ink-500">已有 {it._count.responses} 筆作答</span>
                      )}
                    </div>
                  </div>
                  <ItemActions
                    item={{
                      id: it.id,
                      itemNo: it.itemNo,
                      content: it.content,
                      auditBasis: it.auditBasis,
                      auditFocus: it.auditFocus,
                      expectedEvidence: it.expectedEvidence,
                      responseCount: it._count.responses,
                    }}
                  />
                </li>
              ))}
            </ul>
          </Card>
        </section>
      ))}
    </AppShell>
  );
}
