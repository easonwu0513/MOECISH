import { notFound, redirect } from 'next/navigation';
import { prisma } from '@/lib/db';
import { auth } from '@/lib/auth';
import { AppShell } from '@/components/shell/AppShell';
import { CycleHubBar } from '@/components/cycle/CycleHubBar';
import { Card, CardTitle } from '@/components/ui/Card';
import { Chip } from '@/components/ui/Chip';
import { canAccess } from '@/lib/access-policy';
import { computeDimStats, parseAssignDimensions, ASSIGN_ASPECT_LABELS, ASSIGN_TO_ASPECT } from '@/lib/audit-score';
import { DIMENSIONS, reviewWindowStateForRole, type DeficiencyAspect } from '@/lib/types';
import { DIMENSION_LABELS } from '@/lib/dimension';
import { fmtROCDateTime } from '@/lib/date';
import AuditPad, { type MyFinding } from '../audit/AuditPad';
import PracticePad, { type PracticeItemDTO } from './PracticePad';

/**
 * 稽核發現撰寫練習(批30 師徒制;批42 改版=與委員「實地稽核評分與發現」同款工作台):
 * - 觀察員:AuditPad 練習模式——稽核評分 + 稽核發現 + 右側檢核表意見對照,存獨立 Practice* 表
 *   (硬隔離:絕不進彙整工具/正式報告/缺失管考);無「確認填寫完畢」鎖定流。下方另列指導回饋(唯讀)。
 * - 指導者(委員或中心人員):檢視「自己帶的」觀察員練習(評分唯讀表+發現),逐條回饋
 * - 中心:唯讀監督全部練習
 * - 機關:不可見(redirect)
 */
export default async function PracticePage({ params }: { params: { id: string } }) {
  const session = await auth();
  if (!session) redirect(`/login?callbackUrl=/cycles/${params.id}/practice`);
  const user = session.user;

  if (user.role === 'ORG_ADMIN') redirect(`/cycles/${params.id}`);

  const cycle = await prisma.auditCycle.findUnique({
    where: { id: params.id },
    include: {
      organization: true,
      checklistVersion: {
        include: {
          items: {
            select: { id: true, dimension: true, itemNo: true, content: true, auditBasis: true, auditFocus: true, expectedEvidence: true },
            orderBy: { orderIndex: 'asc' },
          },
        },
      },
      responses: { select: { id: true, checklistItemId: true, compliance: true, description: true } },
    },
  });
  if (!cycle) notFound();

  const stageOpen = ['ONSITE', 'REPORT_ISSUED', 'REMEDIATION', 'CLOSED'].includes(cycle.status);

  // 觀察員:須被配對 + 階段閘(practice.access:ONSITE 起、結案鎖定=cycle.access 已擋)
  let viewerKind: 'observer' | 'mentor' | 'center';
  let observerIds: string[];
  // 本人擔任指導者的觀察員(可寫回饋的範圍):委員=自己帶的;中心人員亦可被配對為指導者(初期場次由中心帶審)
  let mentorObserverIds: string[] = [];
  // 觀察員負責構面(UAT 批43:比照委員的評分頁聚焦標示;純練習標籤,不影響檢視範圍)
  let myDimsRaw: string | null = null;
  if (user.role === 'OBSERVER') {
    const paired = await prisma.cycleObserver.findUnique({
      where: { cycleId_observerId: { cycleId: cycle.id, observerId: user.id } },
      select: { id: true, dimensions: true },
    });
    if (!paired) redirect('/dashboard');
    if (!canAccess('practice.access', 'OBSERVER', cycle.status)) redirect(`/cycles/${cycle.id}`);
    viewerKind = 'observer';
    observerIds = [user.id];
    myDimsRaw = paired.dimensions;
  } else if (user.role === 'AUDITOR') {
    const mentees = await prisma.cycleObserver.findMany({
      where: { cycleId: cycle.id, mentorId: user.id },
      select: { observerId: true },
    });
    if (mentees.length === 0) redirect(`/cycles/${cycle.id}`);
    if (!stageOpen) redirect(`/cycles/${cycle.id}`);
    viewerKind = 'mentor';
    observerIds = mentees.map((m) => m.observerId);
    mentorObserverIds = observerIds;
  } else if (user.role === 'SUPER_ADMIN') {
    if (!stageOpen) redirect(`/cycles/${cycle.id}`);
    const all = await prisma.cycleObserver.findMany({
      where: { cycleId: cycle.id },
      select: { observerId: true, mentorId: true },
    });
    viewerKind = 'center';
    observerIds = all.map((m) => m.observerId);
    mentorObserverIds = all.filter((m) => m.mentorId === user.id).map((m) => m.observerId);
  } else {
    redirect('/dashboard');
  }

  const yearROC = cycle.year - 1911;
  const canEdit = user.role === 'OBSERVER' && canAccess('practice.access', 'OBSERVER', cycle.status);

  // ── 觀察員視角:AuditPad 練習模式(與委員評分頁同款組裝;資料改讀/寫 Practice* 表) ──
  if (viewerKind === 'observer') {
    const items = cycle.checklistVersion.items;
    const stats = computeDimStats(items, cycle.responses);
    // 負責構面聚焦(與委員評分頁同款):未指定=全構面,不顯示聚焦橫幅
    const myDims = parseAssignDimensions(myDimsRaw);
    const assignedLabels = myDims.map((d) => ASSIGN_ASPECT_LABELS[d]);
    const focusAspects = Array.from(new Set(myDims.map((d) => ASSIGN_TO_ASPECT[d]))) as DeficiencyAspect[];
    const itemContent: Record<string, string> = {};
    const itemLaw: Record<string, { auditBasis: string | null; auditFocus: string | null; expectedEvidence: string | null }> = {};
    for (const i of items) {
      itemContent[i.itemNo] = i.content;
      itemLaw[i.itemNo] = { auditBasis: i.auditBasis, auditFocus: i.auditFocus, expectedEvidence: i.expectedEvidence };
    }
    const respByItemId = new Map(cycle.responses.map((r) => [r.checklistItemId, r]));
    const dimIssues: Record<string, { itemNo: string; content: string; level: string }[]> = {};
    for (const i of items) {
      const comp = respByItemId.get(i.id)?.compliance;
      if (comp === 'PARTIALLY_COMPLIANT' || comp === 'NON_COMPLIANT') {
        (dimIssues[i.dimension] ??= []).push({ itemNo: i.itemNo, content: i.content, level: comp });
      }
    }

    // 機關檢核表佐證(就地檢視;/api/evidences 對觀察員於練習階段已豁免窗口,detail 見 rbac)
    const respIds = cycle.responses.map((r) => r.id);
    const checklistEvidence = respIds.length
      ? await prisma.evidence.findMany({
          where: { targetType: 'CHECKLIST_RESPONSE', targetId: { in: respIds } },
          select: { id: true, targetId: true, originalName: true, sizeBytes: true },
          orderBy: { uploadedAt: 'asc' },
        })
      : [];
    const itemNoByItemId = new Map(items.map((i) => [i.id, i.itemNo]));
    const itemNoByResponseId = new Map(cycle.responses.map((r) => [r.id, itemNoByItemId.get(r.checklistItemId)]));
    const evidenceByItemNo: Record<string, { id: string; name: string; sizeKB: number }[]> = {};
    for (const e of checklistEvidence) {
      const itemNo = itemNoByResponseId.get(e.targetId);
      if (!itemNo) continue;
      (evidenceByItemNo[itemNo] ??= []).push({ id: e.id, name: e.originalName, sizeKB: Math.max(1, Math.round(e.sizeBytes / 1024)) });
    }

    // 側欄對照=觀察員本人於「檢核表審閱」留下的觀察員意見(批42;比照委員的審閱筆記同框對照)
    const myNotesByItemNo: Record<string, string[]> = {};
    if (respIds.length) {
      const myComments = await prisma.practiceComment.findMany({
        where: { responseId: { in: respIds }, observerId: user.id },
        select: { responseId: true, content: true },
        orderBy: { createdAt: 'asc' },
      });
      for (const c of myComments) {
        const itemNo = itemNoByResponseId.get(c.responseId);
        if (!itemNo) continue;
        (myNotesByItemNo[itemNo] ??= []).push(c.content);
      }
    }
    const reviewNotesByDim: Record<string, { itemNo: string; content: string; notes: string[]; compliance: string | null; orgDesc: string | null }[]> = {};
    for (const i of items) {
      const notes = myNotesByItemNo[i.itemNo];
      if (notes && notes.length) {
        const resp = respByItemId.get(i.id);
        (reviewNotesByDim[i.dimension] ??= []).push({
          itemNo: i.itemNo,
          content: i.content,
          notes,
          compliance: resp?.compliance ?? null,
          orgDesc: resp?.description ?? null,
        });
      }
    }
    const reviewOpen = reviewWindowStateForRole('OBSERVER', cycle) === 'open';

    const snippets = await prisma.findingSnippet.findMany({
      orderBy: [{ aspect: 'asc' }, { kind: 'asc' }, { orderIndex: 'asc' }, { createdAt: 'asc' }],
    });

    const [myScores, myFindings] = await Promise.all([
      prisma.practiceScore.findMany({ where: { cycleId: cycle.id, observerId: user.id } }),
      prisma.practiceFinding.findMany({
        where: { cycleId: cycle.id, observerId: user.id },
        include: {
          feedbacks: { orderBy: { createdAt: 'asc' }, include: { mentor: { select: { name: true } } } },
        },
        orderBy: { createdAt: 'asc' },
      }),
    ]);
    const findings: MyFinding[] = myFindings.map((f) => ({
      id: f.id,
      aspect: f.aspect as MyFinding['aspect'],
      kind: f.kind as MyFinding['kind'],
      content: f.content,
      checklistRef: f.checklistRef,
      locked: false,
    }));
    const withFeedback = myFindings.filter((f) => f.feedbacks.length > 0);

    return (
      <AppShell
        user={{ name: user.name, email: user.email, role: user.role, organizationName: user.organizationName }}
        cycleId={cycle.id}
        watermark
        wide
        crumbs={[
          { label: '總覽', href: '/dashboard' },
          { label: `${yearROC} 年度 · ${cycle.organization.name}`, href: `/cycles/${cycle.id}` },
          { label: '稽核發現撰寫練習' },
        ]}
      >
        <CycleHubBar
          cycleId={cycle.id}
          label={`${yearROC} 年度 · ${cycle.organization.shortName ?? cycle.organization.name}`}
          nextHint="練習撰寫後,可於檢核表審閱對照素材"
        />
        <header className="mb-5">
          <h1 className="text-headline text-ink-900">稽核發現撰寫練習</h1>
          <p className="text-body-sm text-ink-500 mt-1 leading-relaxed">
            {cycle.organization.name} · {yearROC} 年度 ·
            與委員「實地稽核評分與發現」同款工作台;內容僅您本人、您的指導者與中心可見,不會代入彙整工具、也不會出現在正式稽核報告。
          </p>
        </header>

        <AuditPad
          cycleId={cycle.id}
          canEdit={canEdit}
          practice
          stats={stats}
          itemRefs={items.map((i) => i.itemNo)}
          itemContent={itemContent}
          itemLaw={itemLaw}
          snippets={snippets.map((s) => ({ id: s.id, aspect: s.aspect, kind: s.kind, text: s.text }))}
          dimIssues={dimIssues}
          evidenceByItemNo={evidenceByItemNo}
          reviewNotes={reviewNotesByDim}
          reviewOpen={reviewOpen}
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

        {/* 指導回饋(唯讀):指導者對您練習發現的逐條回饋 */}
        {withFeedback.length > 0 && (
          <Card className="mt-6">
            <CardTitle>指導回饋</CardTitle>
            <ul className="mt-3 flex flex-col divide-y divide-rule">
              {withFeedback.map((f) => (
                <li key={f.id} className="py-3 first:pt-0 last:pb-0">
                  <p className="text-body-sm text-ink-900 leading-relaxed">
                    {f.checklistRef && <span className="mr-1.5 font-mono text-caption text-ink-500">{f.checklistRef}</span>}
                    {f.content}
                  </p>
                  <ul className="mt-2 flex flex-col gap-1.5">
                    {f.feedbacks.map((fb) => (
                      <li key={fb.id} className="rounded-md bg-paper-sunk px-3.5 py-2.5">
                        <p className="text-body-sm text-ink-900 leading-relaxed whitespace-pre-wrap">{fb.content}</p>
                        <p className="mt-1 text-caption text-ink-500">{fb.mentor.name} · {fmtROCDateTime(fb.createdAt)}</p>
                      </li>
                    ))}
                  </ul>
                </li>
              ))}
            </ul>
          </Card>
        )}
      </AppShell>
    );
  }

  // ── 指導者/中心視角:練習發現+回饋(原 PracticePad)+ 各觀察員練習評分(唯讀) ──
  const findings = observerIds.length
    ? await prisma.practiceFinding.findMany({
        where: { cycleId: cycle.id, observerId: { in: observerIds } },
        include: {
          observer: { select: { id: true, name: true } },
          feedbacks: {
            orderBy: { createdAt: 'asc' },
            include: { mentor: { select: { id: true, name: true } } },
          },
        },
        orderBy: { createdAt: 'asc' },
      })
    : [];

  const items: PracticeItemDTO[] = findings.map((f) => ({
    id: f.id,
    observerId: f.observerId,
    observerName: f.observer.name,
    aspect: f.aspect,
    kind: f.kind,
    content: f.content,
    checklistRef: f.checklistRef,
    createdAtISO: f.createdAt.toISOString(),
    feedbacks: f.feedbacks.map((fb) => ({
      id: fb.id,
      mentorId: fb.mentorId,
      mentorName: fb.mentor.name,
      content: fb.content,
      createdAtISO: fb.createdAt.toISOString(),
    })),
  }));

  // 觀察員意見(批42):各觀察員於檢核表審閱留下的逐題練習意見(唯讀;供指導者/中心對照)
  const practiceComments = observerIds.length
    ? await prisma.practiceComment.findMany({
        where: { observerId: { in: observerIds }, response: { cycleId: cycle.id } },
        include: {
          observer: { select: { id: true, name: true } },
          response: { select: { checklistItem: { select: { itemNo: true } } } },
        },
        orderBy: { createdAt: 'asc' },
      })
    : [];

  // 練習評分(唯讀表):各觀察員逐構面分數(批42;供指導者/中心對照回饋)
  const practiceScores = observerIds.length
    ? await prisma.practiceScore.findMany({
        where: { cycleId: cycle.id, observerId: { in: observerIds } },
        include: { observer: { select: { id: true, name: true } } },
      })
    : [];
  const scoresByObserver = new Map<string, { name: string; byDim: Map<string, number | null> }>();
  for (const s of practiceScores) {
    const entry = scoresByObserver.get(s.observerId) ?? { name: s.observer.name, byDim: new Map() };
    entry.byDim.set(s.dimension, s.score);
    scoresByObserver.set(s.observerId, entry);
  }

  const itemRefs = cycle.checklistVersion?.items.map((i) => i.itemNo) ?? [];
  const canFeedback = mentorObserverIds.length > 0 && cycle.status !== 'CLOSED';

  return (
    <AppShell
      user={{ name: user.name, email: user.email, role: user.role, organizationName: user.organizationName }}
      cycleId={cycle.id}
      watermark
      crumbs={[
        { label: '總覽', href: '/dashboard' },
        { label: `${yearROC} 年度 · ${cycle.organization.name}`, href: `/cycles/${cycle.id}` },
        { label: '指導觀察員' },
      ]}
    >
      <CycleHubBar
        cycleId={cycle.id}
        label={`${yearROC} 年度 · ${cycle.organization.shortName ?? cycle.organization.name}`}
        nextHint="回饋後,回工作台查看下一步"
      />
      <header className="mb-5">
        <h1 className="text-headline text-ink-900">指導觀察員</h1>
        <p className="text-body-sm text-ink-500 mt-1 leading-relaxed">
          {viewerKind === 'mentor'
            ? '檢視您指導的觀察員練習(評分與發現),逐條給予回饋;練習內容不進入正式報告。'
            : '中心監督:全部觀察員的練習評分、發現與指導回饋;練習內容不進入正式報告。'}
        </p>
      </header>

      {/* 練習評分(唯讀;觀察員於練習工作台以附件17 同款評分表填寫) */}
      {scoresByObserver.size > 0 && (
        <Card className="mb-6">
          <div className="flex items-center gap-2 flex-wrap">
            <CardTitle>練習評分</CardTitle>
            <Chip size="sm" tone="neutral">唯讀 · 不進正式報告</Chip>
          </div>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-body-sm border-collapse min-w-[40rem]">
              <thead>
                <tr className="text-caption text-ink-500">
                  <th className="text-left font-medium py-1.5 pr-3 border-b border-rule">觀察員</th>
                  {DIMENSIONS.map((d) => (
                    <th key={d} className="text-right font-medium py-1.5 px-2 border-b border-rule whitespace-nowrap" title={DIMENSION_LABELS[d]}>
                      {d}
                    </th>
                  ))}
                  <th className="text-right font-medium py-1.5 pl-2 border-b border-rule">小計</th>
                </tr>
              </thead>
              <tbody>
                {[...scoresByObserver.entries()].map(([obsId, entry]) => {
                  const total = DIMENSIONS.reduce((a, d) => a + (entry.byDim.get(d) ?? 0), 0);
                  return (
                    <tr key={obsId}>
                      <td className="py-1.5 pr-3 text-ink-900">{entry.name}</td>
                      {DIMENSIONS.map((d) => (
                        <td key={d} className="py-1.5 px-2 text-right tabular-nums text-ink-700">
                          {entry.byDim.get(d) ?? '—'}
                        </td>
                      ))}
                      <td className="py-1.5 pl-2 text-right tabular-nums font-medium text-ink-900">{total}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* 觀察員意見(唯讀):各觀察員於檢核表審閱的逐題練習意見 */}
      {practiceComments.length > 0 && (
        <Card className="mb-6">
          <div className="flex items-center gap-2 flex-wrap">
            <CardTitle>觀察員意見(檢核表審閱)</CardTitle>
            <Chip size="sm" tone="neutral">唯讀 · 僅本人/指導者/中心可見</Chip>
          </div>
          <ul className="mt-3 flex flex-col divide-y divide-rule">
            {practiceComments.map((c) => (
              <li key={c.id} className="py-2.5 first:pt-0 last:pb-0">
                <p className="text-body-sm text-ink-900 leading-relaxed whitespace-pre-wrap">
                  <span className="mr-1.5 font-mono text-caption text-ink-500">{c.response.checklistItem.itemNo}</span>
                  {c.content}
                </p>
                <p className="mt-0.5 text-caption text-ink-500">{c.observer.name} · {fmtROCDateTime(c.createdAt)}</p>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <PracticePad
        cycleId={cycle.id}
        viewerKind={viewerKind}
        canEdit={false}
        canFeedback={canFeedback}
        mentorObserverIds={mentorObserverIds}
        userId={user.id}
        itemRefs={itemRefs}
        initialItems={items}
      />
    </AppShell>
  );
}
