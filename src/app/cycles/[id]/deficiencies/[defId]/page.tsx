import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { prisma } from '@/lib/db';
import { auth } from '@/lib/auth';
import { AppShell } from '@/components/shell/AppShell';
import { Card, CardTitle } from '@/components/ui/Card';
import { Chip } from '@/components/ui/Chip';
import { Timeline, type TimelineNode } from '@/components/ui/Timeline';
import { AlertTriangle, Info, History, ChevronLeft, ChevronRight } from '@/components/icons';
import {
  DEFICIENCY_ASPECT_LABELS,
  DEFICIENCY_TYPE_LABELS,
  ACTION_STATUS_LABELS,
  EXEC_STATUS_LABELS,
  COMPLIANCE_LABELS,
  type DeficiencyAspect,
  type DeficiencyType,
  type ActionStatus,
  type ExecStatus,
  type ComplianceLevel,
  type CycleStatus,
} from '@/lib/types';
import { actionStatusTone, actionEditable, CYCLE_STATUS_LABELS } from '@/lib/state-machine';
import { findRepeatDeficiencies } from '@/lib/deficiency-history';
import ActionForm from './ActionForm';
import ReviewPanel from './ReviewPanel';
import ReviewerAssign from './ReviewerAssign';
import { deficiencyAuthors } from '@/lib/deficiency-reviewer';
import AdminDefActions from './AdminDefActions';

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
  if (user.role === 'ORG_ADMIN' && cycle.organizationId !== user.organizationId) redirect('/dashboard');
  if (user.role === 'AUDITOR' && !cycle.assignments.some((a) => a.auditorId === user.id)) redirect('/dashboard');
  // 委員只可檢視/審核「指派給本人審閱」的缺失(UAT 批66:不得以 URL 開他人審閱之缺失詳情);
  // 未指派審閱委員(reviewerAuditorId=null)之缺失,任一委員皆不可見(對齊清單/計數的 reviewer-aware 過濾)。
  if (user.role === 'AUDITOR' && deficiency.reviewerAuditorId !== user.id) redirect(`/cycles/${params.id}/deficiencies`);

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

  // 批32/35:審閱委員 — 開立委員(顯示「由 X 開立」)、參與此次稽核的所有委員(供中心指派)、目前指派
  const relevantAuthors = await deficiencyAuthors(deficiency.id);
  const assignedAuditors = await prisma.user.findMany({
    where: { id: { in: cycle.assignments.map((a) => a.auditorId) } },
    select: { id: true, name: true },
    orderBy: { name: 'asc' },
  });
  const assignedReviewer = deficiency.reviewerAuditorId
    ? assignedAuditors.find((a) => a.id === deficiency.reviewerAuditorId) ?? null
    : null;
  const isDefReviewer =
    user.role === 'SUPER_ADMIN' ||
    (user.role === 'AUDITOR' && deficiency.reviewerAuditorId === user.id);

  // 缺失回鏈:依 checklistRef 找來源檢核項題目 + 機關當初填報(容錯:對不上就不顯示)
  const sourceItem = deficiency.checklistRef
    ? await prisma.checklistItem.findFirst({
        where: { versionId: cycle.checklistVersionId, itemNo: deficiency.checklistRef.trim() },
        select: { id: true, content: true },
      })
    : null;
  const sourceResponse = sourceItem
    ? await prisma.checklistResponse.findUnique({
        where: { cycleId_checklistItemId: { cycleId: cycle.id, checklistItemId: sourceItem.id } },
        select: { compliance: true, description: true },
      })
    : null;

  // 歷年同類缺失:同機關、往年、同檢核項(或同構面)曾發生的缺失,供根因/矯正參考(唯讀)。
  // 租戶隔離由 organizationId 過濾保證;此處的 cycle 已通過上方存取控制。
  const priorDeficiencies = await findRepeatDeficiencies({
    organizationId: cycle.organizationId,
    aspect: deficiency.aspect,
    type: deficiency.type,
    checklistRef: deficiency.checklistRef,
    beforeYear: cycle.year,
    excludeDeficiencyId: deficiency.id,
  });
  const historyNodes: TimelineNode[] = priorDeficiencies.map((h) => {
    const st = (h.action?.status ?? 'PENDING') as ActionStatus;
    const measures = [
      h.action?.measureStrategy && `策略面:${h.action.measureStrategy}`,
      h.action?.measureManagement && `管理面:${h.action.measureManagement}`,
      h.action?.measureTechnical && `技術面:${h.action.measureTechnical}`,
    ].filter(Boolean) as string[];
    return {
      id: h.deficiencyId,
      tone: st === 'PASSED' ? 'success' : 'warning',
      title: (
        <Link
          href={`/cycles/${h.cycleId}/deficiencies/${h.deficiencyId}`}
          className="hover:underline focus-ring rounded-sm"
        >
          {h.yearROC} 年度 · {DEFICIENCY_TYPE_LABELS[h.type as DeficiencyType]} 第 {h.itemNo} 項
        </Link>
      ),
      meta: (
        <span className="inline-flex items-center gap-1.5 flex-wrap">
          <Chip size="sm" tone={actionStatusTone(st)}>{ACTION_STATUS_LABELS[st]}</Chip>
          {h.checklistRef && <span className="font-mono">檢核項 {h.checklistRef}</span>}
          {h.action?.execStatus && (
            <span>{EXEC_STATUS_LABELS[h.action.execStatus as ExecStatus] ?? h.action.execStatus}</span>
          )}
        </span>
      ),
      body:
        h.action?.rootCause || measures.length ? (
          <div className="space-y-1.5">
            {h.action?.rootCause && (
              <p className="leading-relaxed"><span className="text-ink-500">當年根因:</span>{h.action.rootCause}</p>
            )}
            {measures.length > 0 && (
              <p className="leading-relaxed"><span className="text-ink-500">當年矯正:</span>{measures.join('；')}</p>
            )}
          </div>
        ) : (
          <span className="text-ink-500">當年未留存根因/矯正紀錄</span>
        ),
    };
  });

  const canFill =
    user.role === 'ORG_ADMIN' &&
    cycle.status === 'REMEDIATION' &&
    actionEditable(status);
  const canReview = isDefReviewer && status === 'SUBMITTED';

  // ── 下一筆導覽:委員找下一筆已送審;機關找下一筆待填/退回 ──
  const wantNext = (s: ActionStatus) =>
    user.role === 'AUDITOR'
      ? s === 'SUBMITTED'
      : user.role === 'ORG_ADMIN'
      ? s === 'PENDING' || s === 'DRAFT' || s === 'RETURNED'
      : false;
  // 全週期缺失(依構面/類型/項次排序):供「上一筆/下一筆」導覽(所有角色)與委員「下一筆待審」
  const siblings = await prisma.deficiency.findMany({
    where: { cycleId: cycle.id },
    include: { action: { select: { status: true } } },
    orderBy: [{ aspect: 'asc' }, { type: 'asc' }, { itemNo: 'asc' }],
  });
  const matching = siblings.filter(
    (d) =>
      d.id !== deficiency.id &&
      wantNext((d.action?.status ?? 'PENDING') as ActionStatus) &&
      // 委員只導覽/計數自己被指派審閱的缺失(其餘缺失他不可審)
      (user.role !== 'AUDITOR' || d.reviewerAuditorId === user.id),
  );
  // 取排序在本筆之後的第一筆;沒有就回頭取第一筆(環狀)
  const myIdx = siblings.findIndex((d) => d.id === deficiency.id);
  const after = matching.find((d) => siblings.findIndex((x) => x.id === d.id) > myIdx);
  const nextDef = after ?? matching[0] ?? null;
  const nextHref = nextDef ? `/cycles/${cycle.id}/deficiencies/${nextDef.id}` : null;

  // 上一筆/下一筆稽核缺失(依排序、不限狀態;免回列表逐筆點)。
  // 委員只在「指派給本人審閱」的缺失間移動——否則箭頭會指向他人審閱之缺失,點了被上方 redirect 彈回=死連結、
  // 且洩漏他人缺失存在/ID(UAT 批66 reviewer 隔離一致化,對齊上方 matching 的過濾基準)。
  const navPool = user.role === 'AUDITOR'
    ? siblings.filter((d) => d.reviewerAuditorId === user.id)
    : siblings;
  const navIdx = navPool.findIndex((d) => d.id === deficiency.id);
  const prevDefNav = navIdx > 0 ? navPool[navIdx - 1] : null;
  const nextDefNav = navIdx >= 0 && navIdx < navPool.length - 1 ? navPool[navIdx + 1] : null;
  const remaining = matching.length;

  // 最新一輪退回意見(機關視角置頂提示)
  const latestReturn = [...(action?.reviews ?? [])].reverse().find((r) => r.decision === 'RETURN');

  // 機關唯讀時的原因說明
  const orgReadonlyReason =
    user.role === 'ORG_ADMIN' && !canFill && status !== 'PASSED'
      ? cycle.status !== 'REMEDIATION'
        ? `目前週期狀態為「${CYCLE_STATUS_LABELS[cycle.status as CycleStatus]}」,尚未開放矯正填報;待中心開放後即可編輯。`
        : status === 'SUBMITTED'
        ? '本項已送出審核,委員審查期間暫不可編輯;若被退回將重新開放。'
        : null
      : null;

  return (
    <AppShell
      user={{ name: user.name, email: user.email, role: user.role, organizationName: user.organizationName }}
      cycleId={cycle.id}
      watermark
      crumbs={[
        { label: '總覽', href: '/dashboard' },
        { label: '稽核週期', href: '/cycles' },
        { label: `${yearROC} 年度 · ${cycle.organization.name}`, href: `/cycles/${cycle.id}` },
        { label: '缺失與矯正', href: `/cycles/${cycle.id}/deficiencies` },
        { label: `${DEFICIENCY_ASPECT_LABELS[deficiency.aspect as DeficiencyAspect]} ${deficiency.itemNo}` },
      ]}
    >
      <header className="mb-6 flex items-start justify-between gap-4 flex-wrap">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-headline text-ink-900">
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
          <p className="mt-1 text-body-sm text-ink-500">
            {yearROC} 年度 · {cycle.organization.name}
            {deficiency.checklistRef && (
              <> · 檢核項 <span className="font-mono">{deficiency.checklistRef}</span></>
            )}
          </p>
        </div>
        {/* 機關尚未開始填報時,管理員可修正/刪除缺失 */}
        {user.role === 'SUPER_ADMIN' && status === 'PENDING' && cycle.status !== 'CLOSED' && (
          <AdminDefActions
            deficiencyId={deficiency.id}
            cycleId={cycle.id}
            initial={{
              aspect: deficiency.aspect as DeficiencyAspect,
              type: deficiency.type as DeficiencyType,
              description: deficiency.description,
              checklistRef: deficiency.checklistRef,
            }}
          />
        )}
      </header>

      {/* 缺失原文 */}
      <Card className="mb-6" variant="outlined">
        <CardTitle>
          {deficiency.type === 'IMPROVE' ? '待改善事項' : '建議事項'}
        </CardTitle>
        <p className="mt-3 text-body text-ink-900 leading-relaxed whitespace-pre-wrap">
          {deficiency.description}
        </p>
      </Card>

      {/* 缺失回鏈:來源檢核項題目 + 機關當初填報,免翻回檢核表對照 */}
      {sourceItem && (
        <Card className="mb-6" variant="outlined">
          <CardTitle>來源檢核項 {deficiency.checklistRef}</CardTitle>
          <p className="mt-3 text-body-sm text-ink-900 leading-relaxed">{sourceItem.content}</p>
          {sourceResponse?.compliance && (
            <p className="mt-2 text-caption text-ink-500 leading-relaxed">
              機關當初填報:
              <span className="font-medium text-ink-900">
                {COMPLIANCE_LABELS[sourceResponse.compliance as ComplianceLevel] ?? sourceResponse.compliance}
              </span>
              {sourceResponse.description && ` — ${sourceResponse.description}`}
            </p>
          )}
          <Link href={`/cycles/${cycle.id}/checklist`} className="mt-2 inline-block text-caption text-primary-700 hover:underline focus-ring rounded-sm">
            於檢核表查看 →
          </Link>
        </Card>
      )}

      {/* 歷年同類缺失:同機關往年同檢核項(或同構面)曾發生的缺失,供根因與矯正參考 */}
      {historyNodes.length > 0 && (
        <Card className="mb-6" variant="outlined">
          <CardTitle>
            <span className="inline-flex items-center gap-2">
              <History size={18} className="text-warning-600" />
              歷年同類缺失
              <Chip size="sm" tone="warning">{historyNodes.length}</Chip>
            </span>
          </CardTitle>
          <p className="mt-2 mb-4 text-caption text-ink-500 leading-relaxed">
            本機關於往年(近 3 年)曾在
            {deficiency.checklistRef ? <> 同一檢核項 <span className="font-mono">{deficiency.checklistRef}</span></> : <> 同一構面</>}
            發生過下列缺失,供根因分析與矯正措施參考。重複出現代表問題未根治,請從源頭改善。
          </p>
          <Timeline nodes={historyNodes} />
        </Card>
      )}

      {/* 退回補正:最新退回意見置頂(機關第一眼資訊) */}
      {status === 'RETURNED' && latestReturn?.comment && (
        <div className="mb-6 rounded-md border border-danger-200 bg-danger-50 p-4 sm:p-5">
          <div className="flex items-start gap-3">
            <span className="w-9 h-9 rounded-full bg-danger-100 text-danger-700 flex items-center justify-center shrink-0">
              <AlertTriangle size={18} />
            </span>
            <div className="min-w-0">
              <p className="text-title text-danger-700">委員退回意見(第 {latestReturn.round} 輪)</p>
              <p className="mt-1.5 text-body-sm text-danger-700/90 leading-relaxed whitespace-pre-wrap">
                {latestReturn.comment}
              </p>
              <p className="mt-2 text-caption text-danger-600/80">
                請依意見補正下方矯正措施與佐證後重新送審。
              </p>
            </div>
          </div>
        </div>
      )}

      {/* 機關唯讀原因說明 */}
      {orgReadonlyReason && (
        <div className="mb-6 flex items-start gap-2.5 rounded-md bg-paper-sunk px-4 py-3 text-body-sm text-ink-500">
          <Info size={16} className="mt-0.5 shrink-0" />
          <span>{orgReadonlyReason}</span>
        </div>
      )}

      {/* 批32:審閱委員(中心於相關開立委員中指派;審核權限=該委員或中心) */}
      {(user.role === 'SUPER_ADMIN' || isDefReviewer || assignedReviewer) && (
        <div className="mb-6 rounded-lg border border-rule bg-card px-5 py-4">
          <p className="text-title-md text-ink-900 mb-1">審閱委員</p>
          <p className="text-body-sm text-ink-500 mb-3">
            此缺失由 {relevantAuthors.map((a) => a.name).join('、') || '—'} 開立;審核(通過/退回)由指派的審閱委員或中心進行。
          </p>
          {user.role === 'SUPER_ADMIN' ? (
            <ReviewerAssign deficiencyId={deficiency.id} authors={assignedAuditors} current={deficiency.reviewerAuditorId} />
          ) : (
            <p className="text-body-sm text-ink-900">
              {assignedReviewer ? `審閱委員:${assignedReviewer.name}` : '尚未指派審閱委員(由中心指派後方可審核)'}
            </p>
          )}
        </div>
      )}

      {/* 委員審查面板（送審狀態 + 委員身分） */}
      {canReview && action && (
        <ReviewPanel
          deficiencyId={deficiency.id}
          round={action.round}
          nextHref={nextHref}
          remaining={remaining}
          backHref={`/cycles/${cycle.id}/deficiencies`}
        />
      )}

      {/* 矯正措施表單 / 唯讀檢視 */}
      <ActionForm
        deficiencyId={deficiency.id}
        editable={canFill}
        viewOnly={user.role === 'AUDITOR'}
        nextHref={user.role === 'ORG_ADMIN' ? nextHref : null}
        remaining={user.role === 'ORG_ADMIN' ? remaining : 0}
        backHref={`/cycles/${cycle.id}/deficiencies`}
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
                  snapshot: r.snapshot,
                  decidedAt: r.decidedAt.toISOString(),
                  auditorName: reviewerName.get(r.auditorId) ?? '稽核委員',
                })),
              }
            : null
        }
      />

      {/* 上一筆/下一筆稽核缺失導覽(依項次順序,不限狀態;免回列表逐筆點) */}
      {(prevDefNav || nextDefNav) && (
        <nav className="mt-8 pt-5 border-t border-rule flex items-center justify-between gap-3">
          {prevDefNav ? (
            <Link
              href={`/cycles/${cycle.id}/deficiencies/${prevDefNav.id}`}
              className="inline-flex items-center gap-1 min-h-11 pl-2 pr-3.5 rounded-lg text-label-lg font-medium text-primary-700 hover:bg-paper-sunk transition-colors focus-ring"
            >
              <ChevronLeft size={17} aria-hidden />
              上一筆缺失
            </Link>
          ) : (
            <span />
          )}
          <Link
            href={`/cycles/${cycle.id}/deficiencies`}
            className="inline-flex items-center min-h-11 px-2 rounded-lg text-caption text-ink-500 hover:text-ink-900 hover:bg-paper-sunk transition-colors focus-ring"
          >
            回缺失與矯正列表
          </Link>
          {nextDefNav ? (
            <Link
              href={`/cycles/${cycle.id}/deficiencies/${nextDefNav.id}`}
              className="inline-flex items-center gap-1 min-h-11 pl-3.5 pr-2 rounded-lg text-label-lg font-medium text-primary-700 hover:bg-paper-sunk transition-colors focus-ring"
            >
              下一筆缺失
              <ChevronRight size={17} aria-hidden />
            </Link>
          ) : (
            <span />
          )}
        </nav>
      )}
    </AppShell>
  );
}
