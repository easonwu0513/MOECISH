import { notFound, redirect } from 'next/navigation';
import { prisma } from '@/lib/db';
import { auth } from '@/lib/auth';
import { AppShell } from '@/components/shell/AppShell';
import { Card, CardTitle } from '@/components/ui/Card';
import { Chip } from '@/components/ui/Chip';
import {
  DEFICIENCY_ASPECT_LABELS,
  DEFICIENCY_TYPE_LABELS,
  ACTION_STATUS_LABELS,
  type DeficiencyAspect,
  type DeficiencyType,
  type ActionStatus,
} from '@/lib/types';
import { actionStatusTone, actionEditable } from '@/lib/state-machine';
import ActionForm from './ActionForm';
import ReviewPanel from './ReviewPanel';

export default async function DeficiencyDetailPage({
  params,
}: {
  params: { id: string; defId: string };
}) {
  const session = await auth();
  if (!session) redirect(`/login?callbackUrl=/cycles/${params.id}/deficiencies/${params.defId}`);
  const user = session.user;

  const deficiency = await prisma.deficiency.findUnique({
    where: { id: params.defId },
    include: {
      cycle: { include: { organization: true, assignments: true } },
      action: {
        include: {
          reviews: { orderBy: { decidedAt: 'asc' } },
        },
      },
    },
  });
  if (!deficiency || deficiency.cycleId !== params.id) notFound();
  const cycle = deficiency.cycle;

  // 存取控制
  if (user.role === 'ORG_ADMIN' && cycle.organizationId !== user.organizationId) redirect('/');
  if (user.role === 'AUDITOR' && !cycle.assignments.some((a) => a.auditorId === user.id)) redirect('/');

  const action = deficiency.action;
  const status = (action?.status ?? 'PENDING') as ActionStatus;
  const yearROC = cycle.year - 1911;

  const reviewerIds = Array.from(new Set((action?.reviews ?? []).map((r) => r.auditorId)));
  const reviewers = reviewerIds.length
    ? await prisma.user.findMany({
        where: { id: { in: reviewerIds } },
        select: { id: true, name: true },
      })
    : [];
  const reviewerName = new Map(reviewers.map((u) => [u.id, u.name]));

  const canFill =
    user.role === 'ORG_ADMIN' &&
    cycle.status === 'REMEDIATION' &&
    actionEditable(status);
  const canReview = user.role === 'AUDITOR' && status === 'SUBMITTED';

  return (
    <AppShell
      user={{ name: user.name, email: user.email, role: user.role, organizationName: user.organizationName }}
      cycleId={cycle.id}
      crumbs={[
        { label: '總覽', href: '/' },
        { label: '稽核週期', href: '/cycles' },
        { label: `${yearROC} 年度 · ${cycle.organization.name}`, href: `/cycles/${cycle.id}` },
        { label: '缺失與矯正', href: `/cycles/${cycle.id}/deficiencies` },
        { label: `${DEFICIENCY_ASPECT_LABELS[deficiency.aspect as DeficiencyAspect]} ${deficiency.itemNo}` },
      ]}
    >
      <header className="mb-6 flex items-start justify-between gap-4 flex-wrap">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-headline text-on-surface">
              {DEFICIENCY_ASPECT_LABELS[deficiency.aspect as DeficiencyAspect]}・
              {DEFICIENCY_TYPE_LABELS[deficiency.type as DeficiencyType]} 第 {deficiency.itemNo} 項
            </h1>
            <Chip tone={actionStatusTone(status)} size="md" dot>
              {ACTION_STATUS_LABELS[status]}
            </Chip>
            {(action?.round ?? 1) > 1 && (
              <Chip tone="neutral" size="md">第 {action!.round} 輪</Chip>
            )}
          </div>
          <p className="mt-1 text-body text-on-surface-variant">
            {yearROC} 年度 · {cycle.organization.name}
            {deficiency.checklistRef && (
              <> · 檢核項 <span className="font-mono">{deficiency.checklistRef}</span></>
            )}
          </p>
        </div>
      </header>

      {/* 缺失原文 */}
      <Card className="mb-6" variant="outlined">
        <CardTitle>
          {deficiency.type === 'IMPROVE' ? '待改善事項' : '建議事項'}
        </CardTitle>
        <p className="mt-3 text-body text-on-surface leading-relaxed whitespace-pre-wrap">
          {deficiency.description}
        </p>
      </Card>

      {/* 委員審查面板（送審狀態 + 委員身分） */}
      {canReview && action && (
        <ReviewPanel deficiencyId={deficiency.id} round={action.round} />
      )}

      {/* 矯正措施表單 / 唯讀檢視 */}
      <ActionForm
        deficiencyId={deficiency.id}
        editable={canFill}
        action={
          action
            ? {
                id: action.id,
                status,
                round: action.round,
                rootCause: action.rootCause,
                measureStrategy: action.measureStrategy,
                measureManagement: action.measureManagement,
                measureTechnical: action.measureTechnical,
                plannedDate: action.plannedDate?.toISOString() ?? null,
                trackingMethod: action.trackingMethod,
                execStatus: action.execStatus,
                actualDate: action.actualDate?.toISOString() ?? null,
                extendedDate: action.extendedDate?.toISOString() ?? null,
                delayReason: action.delayReason,
                reviews: action.reviews.map((r) => ({
                  id: r.id,
                  round: r.round,
                  decision: r.decision,
                  comment: r.comment,
                  decidedAt: r.decidedAt.toISOString(),
                  auditorName: reviewerName.get(r.auditorId) ?? '稽核委員',
                })),
              }
            : null
        }
      />
    </AppShell>
  );
}
