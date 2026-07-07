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
  SIGNED_REPORT_UPLOAD: '上傳了用印掃描檔',
  SIGNED_REPORT_SUBMIT: '確認繳交用印掃描檔',
  SIGNED_REPORT_CONFIRM: '確認了用印掃描檔',
  SIGNED_REPORT_RETURN: '退回了用印掃描檔',
};

export type CycleActivity = { id: string; who: string; what: string; at: Date };

/**
 * 取某週期的活動流(已依角色收斂範圍、白名單過濾、映射中文)。
 * 角色範圍:中心看全部;機關只看自己機關的活動;委員只看自己的活動(且缺失軌跡限本人審閱範圍)。
 */
export async function getCycleActivities(input: {
  cycleId: string;
  role: Role;
  userId: string;
  organizationId?: string | null;
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

  const rawLogs = await prisma.auditLog.findMany({
    where: {
      OR: [
        { entityType: 'AuditCycle', entityId: input.cycleId },
        { entityType: 'AuditorAssignment', entityId: { in: input.assignmentIds } },
        { entityType: 'Deficiency', entityId: { in: input.deficiencyIds } },
        { entityType: 'CorrectiveAction', entityId: { in: input.actionIds } },
        { entityType: 'SignedReport', entityId: { in: input.signedReportIds } },
        { entityType: 'JourneyProgress', entityId: { in: journeyProgressIds } },
      ],
    },
    orderBy: { createdAt: 'desc' },
    take: Math.max(input.limit * 4, 60), // 多取以吸收白名單/角色過濾後的縮減,再截斷至 limit
    include: { actor: { select: { name: true, organizationId: true } } },
  });

  return rawLogs
    .filter((l) => ACTIVITY_LABELS[l.action])
    .filter((l) => {
      if (input.role === 'AUDITOR') return l.actorId === input.userId;
      if (input.role === 'ORG_ADMIN') return l.actor?.organizationId === input.organizationId;
      return true;
    })
    .slice(0, input.limit)
    .map((l) => ({ id: l.id, who: l.actor?.name ?? '系統', what: ACTIVITY_LABELS[l.action], at: l.createdAt }));
}
