import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { prisma } from '@/lib/db';
import { auth } from '@/lib/auth';
import { DIMENSION_LABELS, DIMENSION_ORDER } from '@/lib/dimension';
import type { Dimension } from '@/lib/types';
import { COMPLIANCE_LABELS, type ComplianceLevel } from '@/lib/types';
import CommentForm from './CommentForm';

export default async function ReviewPage({ params }: { params: { id: string } }) {
  const session = await auth();
  if (!session) redirect(`/login?callbackUrl=/cycles/${params.id}/review`);
  if (session.user.role !== 'AUDITOR' && session.user.role !== 'ADMIN') {
    redirect(`/cycles/${params.id}`);
  }

  const cycle = await prisma.auditCycle.findUnique({
    where: { id: params.id },
    include: {
      organization: true,
      checklistVersion: { include: { items: { orderBy: { orderIndex: 'asc' } } } },
      responses: { include: { comments: { orderBy: { createdAt: 'asc' } } } },
    },
  });
  if (!cycle) notFound();

  const responsesByItem = new Map(cycle.responses.map((r) => [r.checklistItemId, r]));

  const grouped = DIMENSION_ORDER.map((dim) => ({
    dim,
    items: cycle.checklistVersion.items.filter((i) => i.dimension === dim),
  }));

  return (
    <div className="max-w-6xl mx-auto px-6 py-8">
      <header className="mb-6">
        <Link href={`/cycles/${cycle.id}`} className="text-sm text-slate-500 hover:text-brand-600">← 回稽核週期</Link>
        <h1 className="mt-2 text-2xl font-bold text-brand-700">委員審閱</h1>
        <p className="text-sm text-slate-600 mt-1">
          {cycle.organization.name} · {cycle.year - 1911} 年度 · 狀態 {cycle.status}
        </p>
      </header>

      {grouped.map(({ dim, items }) => (
        <section key={dim} className="mb-8">
          <h2 className="text-lg font-semibold text-brand-700 mb-3 border-l-4 border-brand-500 pl-3">
            {DIMENSION_LABELS[dim as Dimension]}（{items.length} 題）
          </h2>
          <div className="space-y-3">
            {items.map((item) => {
              const r = responsesByItem.get(item.id);
              return (
                <div key={item.id} className="bg-white border rounded-lg p-4">
                  <div className="flex items-start gap-3">
                    <div className="min-w-[3.5rem] font-mono text-sm font-semibold text-brand-700">
                      {item.itemNo}
                    </div>
                    <div className="flex-1">
                      <p className="text-sm text-slate-800">{item.content}</p>
                      <div className="mt-2 flex items-center gap-2 text-xs">
                        {r?.compliance ? (
                          <span className="px-2 py-0.5 rounded-full bg-slate-100">
                            {COMPLIANCE_LABELS[r.compliance as ComplianceLevel]}
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-500">未作答</span>
                        )}
                      </div>
                      {r?.description && (
                        <div className="mt-2 bg-slate-50 rounded p-2 text-sm whitespace-pre-wrap text-slate-700">
                          {r.description}
                        </div>
                      )}

                      {r && r.comments.length > 0 && (
                        <div className="mt-3 space-y-2">
                          {r.comments.map((c) => (
                            <div
                              key={c.id}
                              className={`text-sm rounded-md p-2 ${
                                c.resolvedAt
                                  ? 'bg-green-50 border border-green-200'
                                  : 'bg-amber-50 border border-amber-200'
                              }`}
                            >
                              <div className="text-xs text-slate-500 mb-1">
                                第 {c.round} 輪 · {new Date(c.createdAt).toLocaleString('zh-TW')}
                                {c.resolvedAt ? ' · 已補正' : ''}
                              </div>
                              <p className="whitespace-pre-wrap">{c.content}</p>
                            </div>
                          ))}
                        </div>
                      )}

                      {r && <CommentForm responseId={r.id} />}
                      {!r && <p className="mt-2 text-xs text-slate-400">（填報人尚未作答，暫無法留言）</p>}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}
