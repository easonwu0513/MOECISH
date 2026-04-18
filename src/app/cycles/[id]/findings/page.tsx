import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { prisma } from '@/lib/db';
import { auth } from '@/lib/auth';
import {
  FINDING_ASPECT_LABELS,
  FINDING_TYPE_LABELS,
  type FindingAspect,
  type FindingType,
} from '@/lib/types';
import { DIMENSION_LABELS } from '@/lib/dimension';
import type { Dimension } from '@/lib/types';
import FindingForm from './FindingForm';
import RemediationEditor from './RemediationEditor';

export default async function FindingsPage({ params }: { params: { id: string } }) {
  const session = await auth();
  if (!session) redirect(`/login?callbackUrl=/cycles/${params.id}/findings`);
  const user = session.user;

  const cycle = await prisma.auditCycle.findUnique({
    where: { id: params.id },
    include: {
      organization: true,
      findings: {
        include: {
          remediation: { include: { decisions: { orderBy: { round: 'asc' } } } },
        },
        orderBy: [{ findingNo: 'asc' }],
      },
    },
  });
  if (!cycle) notFound();

  if (
    (user.role === 'RESPONDENT' || user.role === 'SUPERVISOR') &&
    cycle.organizationId !== user.organizationId
  ) {
    redirect('/');
  }

  const byAspect: Record<FindingAspect, typeof cycle.findings> = {
    STRATEGY: [],
    MANAGEMENT: [],
    TECHNICAL: [],
  };
  for (const f of cycle.findings) byAspect[f.aspect as FindingAspect].push(f);

  return (
    <div className="max-w-6xl mx-auto px-6 py-8">
      <header className="mb-6">
        <Link href={`/cycles/${cycle.id}`} className="text-sm text-slate-500 hover:text-brand-600">← 回稽核週期</Link>
        <h1 className="mt-2 text-2xl font-bold text-brand-700">模組二　稽核發現與改善</h1>
        <p className="text-sm text-slate-600 mt-1">
          {cycle.organization.name} · {cycle.year - 1911} 年度 · 狀態 {cycle.status} · 共 {cycle.findings.length} 項發現
        </p>
      </header>

      {(user.role === 'AUDITOR' || user.role === 'ADMIN') && (
        <section className="mb-6">
          <FindingForm cycleId={cycle.id} />
        </section>
      )}

      {(['STRATEGY', 'MANAGEMENT', 'TECHNICAL'] as FindingAspect[]).map((aspect) => (
        <section key={aspect} className="mb-8">
          <h2 className="text-lg font-semibold text-brand-700 mb-3 border-l-4 border-brand-500 pl-3">
            {FINDING_ASPECT_LABELS[aspect]}（{byAspect[aspect].length} 項）
          </h2>
          {byAspect[aspect].length === 0 ? (
            <p className="text-sm text-slate-400 pl-4">無發現</p>
          ) : (
            <div className="space-y-4">
              {byAspect[aspect].map((f) => (
                <div key={f.id} className="bg-white border rounded-xl p-5">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <div className="flex items-center gap-2 text-xs">
                        <span className="font-mono font-semibold text-brand-700">{f.findingNo}</span>
                        <span className={`px-2 py-0.5 rounded-full ${typeBadge(f.type as FindingType)}`}>
                          {FINDING_TYPE_LABELS[f.type as FindingType]}
                        </span>
                        <span className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">
                          {DIMENSION_LABELS[f.dimension as Dimension].split('、')[0]}
                        </span>
                      </div>
                      <p className="mt-1 font-semibold text-slate-800">{f.title}</p>
                      <p className="mt-1 text-sm text-slate-700 whitespace-pre-wrap">{f.description}</p>
                    </div>
                  </div>

                  {f.type === 'NEEDS_IMPROVEMENT' && (
                    <RemediationEditor
                      finding={{
                        id: f.id,
                        findingNo: f.findingNo,
                      }}
                      remediation={f.remediation}
                      userRole={user.role}
                    />
                  )}
                </div>
              ))}
            </div>
          )}
        </section>
      ))}
    </div>
  );
}

function typeBadge(t: FindingType) {
  switch (t) {
    case 'LEGAL_COMPLIANT': return 'bg-green-100 text-green-700';
    case 'NEEDS_IMPROVEMENT': return 'bg-red-100 text-red-700';
    case 'SUGGESTION': return 'bg-blue-100 text-blue-700';
  }
}
