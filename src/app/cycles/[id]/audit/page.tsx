import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { prisma } from '@/lib/db';
import { auth } from '@/lib/auth';
import { AppShell } from '@/components/shell/AppShell';
import { Button } from '@/components/ui/Button';
import { FileText } from '@/components/icons';
import { computeDimStats } from '@/lib/audit-score';
import AuditPad, { type MyFinding } from './AuditPad';

/**
 * 實地稽核(附件17):受指派委員填寫評分與稽核發現。
 * 檢核結果統計由機關檢核表填報自動帶入,委員不必手數。
 */
export default async function AuditPadPage({ params }: { params: { id: string } }) {
  const session = await auth();
  if (!session) redirect(`/login?callbackUrl=/cycles/${params.id}/audit`);
  const user = session.user;

  if (user.role === 'ORG_ADMIN') redirect(`/cycles/${params.id}`);

  const cycle = await prisma.auditCycle.findUnique({
    where: { id: params.id },
    include: {
      organization: true,
      assignments: true,
      checklistVersion: { include: { items: { select: { id: true, dimension: true, itemNo: true }, orderBy: { orderIndex: 'asc' } } } },
      responses: { select: { checklistItemId: true, compliance: true } },
    },
  });
  if (!cycle) notFound();

  const isAssigned = cycle.assignments.some((a) => a.auditorId === user.id);
  if (user.role === 'AUDITOR' && !isAssigned) redirect('/dashboard');

  const canEdit = user.role === 'AUDITOR' && isAssigned && cycle.status !== 'CLOSED';

  // 各構面檢核統計(自動帶入評分表)
  const stats = computeDimStats(cycle.checklistVersion.items, cycle.responses);

  const [myScores, myFindings] = await Promise.all([
    user.role === 'AUDITOR'
      ? prisma.auditScore.findMany({ where: { cycleId: cycle.id, auditorId: user.id } })
      : Promise.resolve([]),
    user.role === 'AUDITOR'
      ? prisma.auditFinding.findMany({
          where: { cycleId: cycle.id, auditorId: user.id },
          orderBy: { createdAt: 'asc' },
        })
      : Promise.resolve([]),
  ]);

  const findings: MyFinding[] = myFindings.map((f) => ({
    id: f.id,
    aspect: f.aspect as MyFinding['aspect'],
    kind: f.kind as MyFinding['kind'],
    content: f.content,
    checklistRef: f.checklistRef,
    locked: Boolean(f.deficiencyId),
  }));

  return (
    <AppShell
      user={{ name: user.name, email: user.email, role: user.role, organizationName: user.organizationName }}
      cycleId={cycle.id}
      crumbs={[
        { label: '總覽', href: '/dashboard' },
        { label: `${cycle.year - 1911} 年度`, href: `/cycles/${cycle.id}` },
        { label: '實地稽核' },
      ]}
    >
      <header className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-headline text-neutral-900">實地稽核評分與發現</h1>
          <p className="text-body-sm text-neutral-500 mt-1">
            {cycle.organization.name} · {cycle.year - 1911} 年度 ·{' '}
            {user.role === 'AUDITOR'
              ? canEdit
                ? '填寫您個人的評分與稽核發現;檢核統計由機關填報自動帶入'
                : '已結案,唯讀'
              : '管理員檢視(評分與發現由各委員填寫)'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link href={`/cycles/${cycle.id}/audit/print`} target="_blank" rel="noopener">
            <Button variant="tonal" size="sm" leadingIcon={<FileText size={15} />}>
              {user.role === 'AUDITOR' ? '列印我的評分表(附件17)' : '列印各委員評分表'}
            </Button>
          </Link>
          <Link href={`/cycles/${cycle.id}/audit/report`}>
            <Button variant="tonal" size="sm" leadingIcon={<FileText size={15} />}>
              彙整報告
            </Button>
          </Link>
        </div>
      </header>

      {user.role === 'AUDITOR' ? (
        <AuditPad
          cycleId={cycle.id}
          canEdit={canEdit}
          stats={stats}
          itemRefs={cycle.checklistVersion.items.map((i) => i.itemNo)}
          initialScores={Object.fromEntries(myScores.map((s) => [s.dimension, s.score]))}
          initialFindings={findings}
        />
      ) : (
        <div className="rounded-md border border-outline-variant/60 bg-surface-container-lowest px-5 py-5">
          <p className="text-body-sm text-on-surface-variant leading-relaxed">
            評分與發現由受指派之稽核委員登入填寫;您可至「彙整報告」即時檢視全體委員的整合結果、列印,
            並一鍵將待改善/建議事項轉入缺失管考。
          </p>
          <Button
            href={`/cycles/${cycle.id}/audit/report`}
            variant="filled"
            size="sm"
            leadingIcon={<FileText size={15} />}
            className="mt-4"
          >
            前往彙整報告
          </Button>
        </div>
      )}
    </AppShell>
  );
}
