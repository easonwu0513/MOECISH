import { prisma } from './db';
import type { Role } from './types';

/**
 * 週期「最近活動 / 活動歷史」單一來源(UAT:機關管理員不只一位時,需知道其他管理員做了什麼)。
 * 週期頁最近活動卡(前 6 筆)與活動歷史頁(/cycles/[id]/activity,完整清單)共吃此處,不再各抄查詢。
 * 僅白名單動作轉中文顯示(未列者略過,避免顯示內部代碼);含引導清單手動勾選(JourneyProgress)。
 */
export const ACTIVITY_LABELS: Record<string, string> = {
  CYCLE_TRANSITION: '推進了週期階段',
  CYCLE_ROLLBACK: '回退了週期階段',
  JOURNEY_ITEM_DONE: '完成了引導清單項目',
  JOURNEY_ITEM_UNDONE: '取消勾選引導清單項目',
  PREP_SUBMIT: '繳交了稽核前資料',
  // 機關協作互見(批66 M5):上傳/刪除佐證、送出/退回檢核表(逐題儲存、autosave 等高頻雜訊不列入)
  EVIDENCE_UPLOAD: '上傳了佐證文件',
  EVIDENCE_DELETE: '刪除了佐證文件',
  'checklist.submit': '送出了資通安全檢核表',
  'checklist.reopen': '退回了檢核表重填',
  CYCLE_UPDATE: '更新了週期設定',
  CYCLE_NOTIFY_ORG_ADMINS: '通知機關填報矯正',
  CYCLE_NOTIFY_OPENED: '通知機關稽核作業開立',
  CYCLE_NOTIFY_COMMITTEE_REVIEW: '通知委員開始審閱',
  'audit.findings.convert': '彙整稽核發現為缺失',
  'audit.finish': '完成年度稽核、發布缺失',
  AUDITOR_ASSIGN: '指派了稽核委員',
  AUDITOR_UNASSIGN: '移除了委員指派',
  'audit.score.lock': '確認填寫完畢並鎖定評分',
  'audit.score.unlock': '解除了評分鎖定',
  'audit.score.return': '退回了委員評分',
  CHECKLIST_REVIEW_DONE: '完成了檢核表審閱意見',
  DEFICIENCY_CREATE: '新增了缺失',
  DEFICIENCY_IMPORT: '匯入了缺失',
  ACTION_SUBMIT: '送出了矯正措施',
  ACTION_PASS: '審核通過了矯正措施',
  ACTION_RETURN: '退回了矯正措施補正',
  SIGNED_REPORT_UPLOAD: '上傳了用印掃描檔',
  SIGNED_REPORT_SUBMIT: '確認繳交用印掃描檔',
  SIGNED_REPORT_CONFIRM: '確認了用印掃描檔',
  SIGNED_REPORT_RETURN: '退回了用印掃描檔',
};

export type CycleActivity = { id: string; who: string; what: string; at: Date };

/**
 * 取某週期的活動流(已依角色收斂範圍、白名單過濾、映射中文)。
 * 角色範圍:中心看全部;機關只看自己機關的活動;委員只看自己的活動(且缺失軌跡限本人審閱範圍);
 * 觀察員只看自己 + 配對指導委員的活動(師徒制,不可見中心/機關/其他委員的工作紀錄);
 * 未列舉角色一律只看自己(逐角色顯式列舉、預設拒絕——批30 雷區:新角色落入 fail-open 即繼承中心視野)。
 */
export async function getCycleActivities(input: {
  cycleId: string;
  role: Role;
  userId: string;
  organizationId?: string | null;
  /** 觀察員專用:本週期配對的指導委員 userId(僅此人與本人的活動可見) */
  mentorUserId?: string | null;
  assignmentIds: string[];
  /** 委員限本人審閱範圍(myDeficiencies);其餘角色為全部缺失 */
  deficiencyIds: string[];
  actionIds: string[];
  signedReportIds: string[];
  limit: number;
}): Promise<CycleActivity[]> {
  const journeyProgressIds = (await prisma.journeyProgress.findMany({
    where: { cycleId: input.cycleId },
    select: { id: true },
  })).map((p) => p.id);

  // 佐證(Evidence)以 (targetType,targetId) 尋址、無 cycleId 欄,故用 cycleId 自查本週期相關佐證 id 集合
  // (檢核表作答 / 資料準備繳交 / 矯正措施 / 週期本身),收進函式內部——呼叫端零改動(不新增參數)。
  const [checklistResponseIds, prepSubmissionIds] = await Promise.all([
    prisma.checklistResponse.findMany({ where: { cycleId: input.cycleId }, select: { id: true } }),
    prisma.prepSubmission.findMany({ where: { requirement: { cycleId: input.cycleId } }, select: { id: true } }),
  ]);
  const evidenceTargets: { targetType: string; ids: string[] }[] = [
    { targetType: 'AUDIT_CYCLE', ids: [input.cycleId] },
    { targetType: 'CHECKLIST_RESPONSE', ids: checklistResponseIds.map((r) => r.id) },
    { targetType: 'PREP_SUBMISSION', ids: prepSubmissionIds.map((s) => s.id) },
    { targetType: 'CORRECTIVE_ACTION', ids: input.actionIds },
  ].filter((t) => t.ids.length > 0);
  const evidenceIds = (
    await prisma.evidence.findMany({
      where: { OR: evidenceTargets.map((t) => ({ targetType: t.targetType, targetId: { in: t.ids } })) },
      select: { id: true },
    })
  ).map((e) => e.id);

  const rawLogs = await prisma.auditLog.findMany({
    where: {
      OR: [
        { entityType: 'AuditCycle', entityId: input.cycleId },
        { entityType: 'AuditorAssignment', entityId: { in: input.assignmentIds } },
        { entityType: 'Deficiency', entityId: { in: input.deficiencyIds } },
        { entityType: 'CorrectiveAction', entityId: { in: input.actionIds } },
        { entityType: 'SignedReport', entityId: { in: input.signedReportIds } },
        { entityType: 'JourneyProgress', entityId: { in: journeyProgressIds } },
        { entityType: 'Evidence', entityId: { in: evidenceIds } },
      ],
    },
    orderBy: { createdAt: 'desc' },
    take: Math.max(input.limit * 4, 60), // 多取以吸收白名單/角色過濾後的縮減,再截斷至 limit
    include: { actor: { select: { name: true, organizationId: true } } },
  });

  return rawLogs
    .filter((l) => ACTIVITY_LABELS[l.action])
    .filter((l) => {
      switch (input.role) {
        case 'SUPER_ADMIN': return true;
        case 'ORG_ADMIN': return l.actor?.organizationId === input.organizationId;
        case 'AUDITOR': return l.actorId === input.userId;
        case 'OBSERVER': return l.actorId === input.userId || (!!input.mentorUserId && l.actorId === input.mentorUserId);
        default: return l.actorId === input.userId; // 未列舉角色:僅見本人(預設拒絕)
      }
    })
    .slice(0, input.limit)
    .map((l) => ({ id: l.id, who: l.actor?.name ?? '系統', what: ACTIVITY_LABELS[l.action], at: l.createdAt }));
}
