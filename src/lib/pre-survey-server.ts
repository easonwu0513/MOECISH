import { prisma } from './db';
import { requireUser, AuthError } from './rbac';
import { canAccess } from './access-policy';
import type { Role } from './types';

/**
 * 事前場次調查(批A)伺服器端授權 helper。
 * 粗閘 canAccess('presurvey.view')(中心/委員/觀察員;機關與未知角色 fail-closed)之上,
 * 細粒度為「中心(全可)或本人(綁定帳號 userId===user.id)」——委員/觀察員只能操作自己那筆。
 */
/** UAT 圖57:歷年資料唯讀——年度小於「今天(台北)所屬年度」即不可再寫入(任何身分,含中心)。 */
export function isHistoricalSurveyYear(year: number): boolean {
  return year < new Date(Date.now() + 8 * 3600 * 1000).getUTCFullYear();
}

/** 寫入前檢查:歷年年度一律 400(所有事前場次調查寫入 API 共用;讀取/匯出不受限)。 */
export function assertSurveyYearWritable(year: number): void {
  if (isHistoricalSurveyYear(year)) {
    throw new AuthError(400, '歷年資料為唯讀，不可再編修。');
  }
}

export async function loadParticipantForAccess(participantId: string) {
  const user = await requireUser();
  if (!canAccess('presurvey.view', user.role as Role, 'REMEDIATION')) {
    throw new AuthError(403, '無權存取事前場次調查');
  }
  const participant = await prisma.surveyParticipant.findUnique({ where: { id: participantId } });
  if (!participant) throw new AuthError(404, '受調人員不存在');
  const isAdmin = user.role === 'SUPER_ADMIN';
  const isSelf = participant.userId === user.id;
  if (!isAdmin && !isSelf) throw new AuthError(403, '僅本人或中心可操作此受調人員');
  return { user, participant, isAdmin, isSelf };
}
