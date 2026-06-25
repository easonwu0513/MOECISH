import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { prisma } from '@/lib/db';
import { auth } from '@/lib/auth';
import { AppShell } from '@/components/shell/AppShell';
import { Button } from '@/components/ui/Button';
import { FileText } from '@/components/icons';
import { computeDimStats, parseAssignDimensions, ASSIGN_ASPECT_LABELS, ASSIGN_TO_ASPECT } from '@/lib/audit-score';
import type { DeficiencyAspect } from '@/lib/types';
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
  // 管理員此頁本只有一句說明+前往彙整報告鈕(零操作),直接導向彙整報告(委員仍進 AuditPad 評分)
  if (user.role === 'SUPER_ADMIN') redirect(`/cycles/${params.id}/audit/report`);

  const cycle = await prisma.auditCycle.findUnique({
    where: { id: params.id },
    include: {
      organization: true,
      assignments: true,
      checklistVersion: { include: { items: { select: { id: true, dimension: true, itemNo: true, content: true }, orderBy: { orderIndex: 'asc' } } } },
      responses: { select: { checklistItemId: true, compliance: true } },
    },
  });
  if (!cycle) notFound();

  const isAssigned = cycle.assignments.some((a) => a.auditorId === user.id);
  if (user.role === 'AUDITOR' && !isAssigned) redirect('/dashboard');

  // 委員「確認填寫完畢」鎖定後唯讀;解除鎖定方可再編輯(會通知中心)
  const myAssignment = cycle.assignments.find((a) => a.auditorId === user.id);
  const locked = Boolean(myAssignment?.scoreLockedAt);

  // 指派負責構面(三構面四類):評分頁聚焦用。未指定 = 全構面。
  const myDims = parseAssignDimensions(myAssignment?.dimensions);
  const assignedLabels = myDims.map((d) => ASSIGN_ASPECT_LABELS[d]);
  const focusAspects = Array.from(new Set(myDims.map((d) => ASSIGN_TO_ASPECT[d]))) as DeficiencyAspect[];
  const canEdit = user.role === 'AUDITOR' && isAssigned && cycle.status !== 'CLOSED' && !locked;

  // 各構面檢核統計(自動帶入評分表)
  const stats = computeDimStats(cycle.checklistVersion.items, cycle.responses);

  // A5:項次 → 題目內容(委員輸入發現項次時顯示題目摘要)
  const itemContent: Record<string, string> = {};
  for (const i of cycle.checklistVersion.items) itemContent[i.itemNo] = i.content;

  // A4:各構面「部分符合/不符合」題目明細(委員打分前就地看扣分依據)
  const respByItemId = new Map(cycle.responses.map((r) => [r.checklistItemId, r.compliance]));
  const dimIssues: Record<string, { itemNo: string; content: string; level: string }[]> = {};
  for (const i of cycle.checklistVersion.items) {
    const comp = respByItemId.get(i.id);
    if (comp === 'PARTIALLY_COMPLIANT' || comp === 'NON_COMPLIANT') {
      (dimIssues[i.dimension] ??= []).push({ itemNo: i.itemNo, content: i.content, level: comp });
    }
  }

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
        { label: `${cycle.year - 1911} 年度 · ${cycle.organization.name}`, href: `/cycles/${cycle.id}` },
        { label: '實地稽核' },
      ]}
      watermark
    >
      <header className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-headline text-on-surface">實地稽核評分與發現</h1>
          <p className="text-body-sm text-on-surface-variant mt-1">
            {cycle.organization.name} · {cycle.year - 1911} 年度 ·{' '}
            {user.role === 'AUDITOR'
              ? canEdit
                ? '填寫您個人的評分、檢核結果數量與稽核發現;機關自評僅供參考'
                : locked
                  ? '您已確認填寫完畢、目前鎖定中;如需修改請按「解除鎖定」'
                  : '已結案,唯讀'
              : '管理員檢視(評分與發現由各委員填寫)'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link href={`/cycles/${cycle.id}/audit/print`} target="_blank" rel="noopener">
            <Button variant="tonal" size="sm" leadingIcon={<FileText size={15} />}>
              列印我的評分表(附件17)
            </Button>
          </Link>
          {/* 「彙整報告」為中心(最高管理員)用的全體委員整合視圖,委員端不顯示 */}
        </div>
      </header>

      {user.role === 'AUDITOR' ? (
        <AuditPad
          cycleId={cycle.id}
          canEdit={canEdit}
          locked={locked}
          stats={stats}
          itemRefs={cycle.checklistVersion.items.map((i) => i.itemNo)}
          itemContent={itemContent}
          dimIssues={dimIssues}
          assignedLabels={assignedLabels}
          focusAspects={focusAspects}
          initialScores={Object.fromEntries(myScores.map((s) => [s.dimension, s.score]))}
          initialCounts={Object.fromEntries(
            myScores.map((s) => [
              s.dimension,
              { c1: s.cntComply, c2: s.cntPartial, c3: s.cntNonComply, c4: s.cntNa },
            ]),
          )}
          initialFindings={findings}
        />
      ) : (
        <div className="rounded-md border border-outline-variant/60 bg-surface-container-lowest px-5 py-5">
          <p className="text-body-sm text-on-surface-variant leading-relaxed">
            評分與發現由受指派之稽核委員登入填寫;請用右上角「彙整報告」即時檢視全體委員的整合結果、列印,
            並一鍵將待改善事項與建議事項轉入缺失管考。
          </p>
        </div>
      )}
    </AppShell>
  );
}
