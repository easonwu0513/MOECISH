import { notFound, redirect } from 'next/navigation';
import { prisma } from '@/lib/db';
import { auth } from '@/lib/auth';
import { AppShell } from '@/components/shell/AppShell';
import { CycleHubBar } from '@/components/cycle/CycleHubBar';
import { computeDimStats, parseAssignDimensions, ASSIGN_ASPECT_LABELS, ASSIGN_TO_ASPECT } from '@/lib/audit-score';
import { auditorCanScore, auditorReviewWindowState, type DeficiencyAspect } from '@/lib/types';
import AuditPad, { type MyFinding } from './AuditPad';

/**
 * 實地稽核(附件17):受指派委員填寫評分與稽核發現。
 * 檢核結果統計由機關檢核表填報自動帶入,委員不必手數。
 */
export default async function AuditPadPage({ params }: { params: { id: string } }) {
  const session = await auth();
  if (!session) redirect(`/login?callbackUrl=/cycles/${params.id}/audit`);
  const user = session.user;
  // 未列舉角色預設拒絕(批30 雷區:新角色落過各 role redirect 即 fail-open 繼承視野)
  if (!['SUPER_ADMIN', 'ORG_ADMIN', 'AUDITOR', 'OBSERVER'].includes(user.role)) redirect('/dashboard');

  if (user.role === 'ORG_ADMIN') redirect(`/cycles/${params.id}`);
  // 管理員此頁本只有一句說明+前往彙整報告鈕(零操作),直接導向彙整報告(委員仍進 AuditPad 評分)
  if (user.role === 'SUPER_ADMIN') redirect(`/cycles/${params.id}/audit/report`);
  // 觀察員(批30):完全移除評分——一律導向「稽核發現撰寫練習」工作台(需求二-1)
  if (user.role === 'OBSERVER') redirect(`/cycles/${params.id}/practice`);

  const cycle = await prisma.auditCycle.findUnique({
    where: { id: params.id },
    include: {
      organization: true,
      assignments: true,
      checklistVersion: { include: { items: { select: { id: true, dimension: true, itemNo: true, content: true, auditBasis: true, auditFocus: true, expectedEvidence: true }, orderBy: { orderIndex: 'asc' } } } },
      responses: { select: { id: true, checklistItemId: true, compliance: true, description: true } },
    },
  });
  if (!cycle) notFound();

  const isAssigned = cycle.assignments.some((a) => a.auditorId === user.id);
  if (user.role === 'AUDITOR' && !isAssigned) redirect('/dashboard');
  // 委員「實地稽核評分與發現」於進入「實地稽核(ONSITE)」階段後才開放;資料準備/齊備階段尚不評分
  if (user.role === 'AUDITOR' && !auditorCanScore(cycle.status)) redirect('/dashboard');

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

  // 項次 → 法規對照(發現表單「法規對照」鈕展開稽核依據/重點/應備文件)
  const itemLaw: Record<string, { auditBasis: string | null; auditFocus: string | null; expectedEvidence: string | null }> = {};
  for (const i of cycle.checklistVersion.items) {
    itemLaw[i.itemNo] = { auditBasis: i.auditBasis, auditFocus: i.auditFocus, expectedEvidence: i.expectedEvidence };
  }

  // 發現片語庫(剪貼簿;最高管理員維護,委員可一鍵插入)
  const snippets = await prisma.findingSnippet.findMany({
    orderBy: [{ aspect: 'asc' }, { kind: 'asc' }, { orderIndex: 'asc' }, { createdAt: 'asc' }],
  });

  // A4:各構面「部分符合/不符合」題目明細(委員打分前就地看扣分依據);map 帶整列(含機關說明,供筆記側欄同框對照)
  const respByItemId = new Map(cycle.responses.map((r) => [r.checklistItemId, r]));
  const dimIssues: Record<string, { itemNo: string; content: string; level: string }[]> = {};
  for (const i of cycle.checklistVersion.items) {
    const comp = respByItemId.get(i.id)?.compliance;
    if (comp === 'PARTIALLY_COMPLIANT' || comp === 'NON_COMPLIANT') {
      (dimIssues[i.dimension] ??= []).push({ itemNo: i.itemNo, content: i.content, level: comp });
    }
  }

  // W3/R3:機關檢核表佐證檔,依項次(itemNo)歸戶,供 AuditPad 佐證側欄「就地檢視真實佐證」評分。
  // 授權沿用 /api/evidences/[id]/download → assertEvidenceAccess(ONSITE 起委員可存取 CHECKLIST_RESPONSE 佐證,不受審閱窗口限制)。
  const respIds = cycle.responses.map((r) => r.id);
  const checklistEvidence = respIds.length
    ? await prisma.evidence.findMany({
        where: { targetType: 'CHECKLIST_RESPONSE', targetId: { in: respIds } },
        select: { id: true, targetId: true, originalName: true, sizeBytes: true },
        orderBy: { uploadedAt: 'asc' },
      })
    : [];
  const itemNoByItemId = new Map(cycle.checklistVersion.items.map((i) => [i.id, i.itemNo]));
  const itemNoByResponseId = new Map(cycle.responses.map((r) => [r.id, itemNoByItemId.get(r.checklistItemId)]));
  const evidenceByItemNo: Record<string, { id: string; name: string; sizeKB: number }[]> = {};
  for (const e of checklistEvidence) {
    const itemNo = itemNoByResponseId.get(e.targetId);
    if (!itemNo) continue;
    (evidenceByItemNo[itemNo] ??= []).push({ id: e.id, name: e.originalName, sizeKB: Math.max(1, Math.round(e.sizeBytes / 1024)) });
  }

  // 佐證側欄改顯示「委員本人於『委員審閱』階段留下的逐題筆記」(取代原機關自評部分/不符合清單):
  // 委員逐題審閱,不僅看機關自評的部分符合/不符合;此為委員評分時的個人參照。依項次歸戶後分構面。
  const myNotesByItemNo: Record<string, string[]> = {};
  if (user.role === 'AUDITOR' && respIds.length) {
    const myComments = await prisma.auditorComment.findMany({
      where: { responseId: { in: respIds }, auditorId: user.id },
      select: { responseId: true, content: true, round: true },
      orderBy: [{ round: 'asc' }],
    });
    for (const c of myComments) {
      const itemNo = itemNoByResponseId.get(c.responseId);
      if (!itemNo) continue;
      (myNotesByItemNo[itemNo] ??= []).push(c.content);
    }
  }
  // 同框對照(大改造B):筆記列附上機關作答(符合度+說明),評分/寫發現時免跳回審閱頁查上下文
  const reviewNotesByDim: Record<string, { itemNo: string; content: string; notes: string[]; compliance: string | null; orgDesc: string | null }[]> = {};
  for (const i of cycle.checklistVersion.items) {
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
  // 審閱窗口是否開啟:決定側欄「在審閱頁開啟」深連結是否顯示(窗口關閉時目標頁是鎖定卡,不給死鏈)
  const reviewOpen = auditorReviewWindowState(cycle.reviewWindowStart, cycle.reviewWindowEnd) === 'open';

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
      wide
    >
      {/* 回工作台導引列:與 prep/checklist/deficiencies 一致(原 review/audit 缺=動線斷崖,審計#6) */}
      <CycleHubBar
        cycleId={cycle.id}
        label={`${cycle.year - 1911} 年度 · ${cycle.organization.shortName ?? cycle.organization.name}`}
        nextHint="評分與發現定稿後，回工作台查看下一步"
      />
      <header className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-headline text-ink-900">實地稽核評分與發現</h1>
          <p className="text-body-sm text-ink-500 mt-1">
            {cycle.organization.name} · {cycle.year - 1911} 年度 ·{' '}
            {user.role === 'AUDITOR'
              ? canEdit
                ? '填寫您個人的評分、檢核結果數量與稽核發現；機關自評僅供參考'
                : locked
                  ? '您已確認填寫完畢、目前鎖定中；如需修改請按「解除鎖定」'
                  : '已結案，唯讀'
              : '管理員檢視（評分與發現由各委員填寫）'}
          </p>
        </div>
        {/* 附件17 評分表改由最高管理員於「彙整報告」頁逐委員列印、交付紙本簽名;委員頁不再自印 */}
      </header>

      {user.role === 'AUDITOR' ? (
        <AuditPad
          cycleId={cycle.id}
          canEdit={canEdit}
          locked={locked}
          stats={stats}
          itemRefs={cycle.checklistVersion.items.map((i) => i.itemNo)}
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
      ) : (
        <div className="rounded-md border border-rule bg-card px-5 py-5">
          <p className="text-body-sm text-ink-500 leading-relaxed">
            評分與發現由受指派之稽核委員登入填寫；請用右上角「彙整報告」即時檢視全體委員的整合結果、列印，
            並一鍵將待改善事項與建議事項轉入缺失管考。
          </p>
        </div>
      )}
    </AppShell>
  );
}
