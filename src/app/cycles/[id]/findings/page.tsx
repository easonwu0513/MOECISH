import { notFound, redirect } from 'next/navigation';
import { prisma } from '@/lib/db';
import { auth } from '@/lib/auth';
import { AppShell } from '@/components/shell/AppShell';
import { Card, CardTitle, CardDescription } from '@/components/ui/Card';
import { Chip } from '@/components/ui/Chip';
import { EmptyState } from '@/components/ui/EmptyState';
import { AlertTriangle } from '@/components/icons';
import {
  FINDING_ASPECT_LABELS,
  FINDING_TYPE_LABELS,
  type FindingAspect,
  type FindingType,
  type Dimension,
} from '@/lib/types';
import { DIMENSION_LABELS } from '@/lib/dimension';
import { EMPTY } from '@/lib/copy';
import FindingForm from './FindingForm';
import RemediationEditor from './RemediationEditor';

const aspectTone: Record<FindingAspect, 'primary' | 'sage' | 'neutral'> = {
  STRATEGY: 'primary',
  MANAGEMENT: 'sage',
  TECHNICAL: 'neutral',
};

const typeTone: Record<FindingType, 'success' | 'warning' | 'primary'> = {
  LEGAL_COMPLIANT: 'success',
  NEEDS_IMPROVEMENT: 'warning',
  SUGGESTION: 'primary',
};

export default async function FindingsPage({ params }: { params: { id: string } }) {
  const session = await auth();
  if (!session) redirect(`/login?callbackUrl=/cycles/${params.id}/findings`);
  const user = session.user;

  const cycle = await prisma.auditCycle.findUnique({
    where: { id: params.id },
    include: {
      organization: true,
      findings: {
        include: { remediation: { include: { decisions: { orderBy: { round: 'asc' } } } } },
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

  const canOpenFinding = user.role === 'AUDITOR' || user.role === 'ADMIN';

  const byAspect: Record<FindingAspect, typeof cycle.findings> = {
    STRATEGY: [],
    MANAGEMENT: [],
    TECHNICAL: [],
  };
  for (const f of cycle.findings) byAspect[f.aspect as FindingAspect].push(f);

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
        { label: '模組二 · 稽核發現' },
      ]}
    >
      <header className="mb-5 flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-headline text-neutral-900">模組二　稽核發現與改善</h1>
          <p className="text-body-sm text-neutral-500 mt-1">
            {cycle.organization.name} · 共 {cycle.findings.length} 項發現
          </p>
        </div>
        {canOpenFinding && <FindingForm cycleId={cycle.id} />}
      </header>

      {cycle.findings.length === 0 ? (
        <Card>
          <EmptyState
            icon={<AlertTriangle size={28} />}
            title={EMPTY.noFindings.title}
            description={EMPTY.noFindings.description}
          />
        </Card>
      ) : (
        (['STRATEGY', 'MANAGEMENT', 'TECHNICAL'] as FindingAspect[]).map((aspect) => (
          <section key={aspect} className="mb-8">
            <div className="flex items-center gap-2 mb-4">
              <Chip tone={aspectTone[aspect]} variant="outlined" size="md">{FINDING_ASPECT_LABELS[aspect]}</Chip>
              <span className="text-caption text-neutral-500">{byAspect[aspect].length} 項</span>
            </div>
            {byAspect[aspect].length === 0 ? (
              <p className="text-body-sm text-neutral-400 mb-4 pl-1">本構面目前無發現</p>
            ) : (
              <div className="flex flex-col gap-4">
                {byAspect[aspect].map((f) => (
                  <Card key={f.id} elevation={1}>
                    <div className="flex items-start justify-between gap-3 flex-wrap">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap mb-1.5">
                          <span className="font-mono text-title text-primary-700">{f.findingNo}</span>
                          <Chip tone={typeTone[f.type as FindingType]} size="sm">
                            {FINDING_TYPE_LABELS[f.type as FindingType]}
                          </Chip>
                          <Chip tone="neutral" size="sm">
                            {DIMENSION_LABELS[f.dimension as Dimension].split('、')[0]}
                          </Chip>
                        </div>
                        <p className="font-semibold text-body text-neutral-900">{f.title}</p>
                        <p className="mt-1 text-body-sm text-neutral-700 whitespace-pre-wrap leading-relaxed">{f.description}</p>
                      </div>
                    </div>

                    {f.type === 'NEEDS_IMPROVEMENT' && (
                      <RemediationEditor
                        finding={{ id: f.id, findingNo: f.findingNo }}
                        remediation={f.remediation}
                        userRole={user.role}
                      />
                    )}
                  </Card>
                ))}
              </div>
            )}
          </section>
        ))
      )}
    </AppShell>
  );
}
