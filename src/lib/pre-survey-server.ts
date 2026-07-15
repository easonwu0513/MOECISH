import { prisma } from './db';
import { requireUser, AuthError } from './rbac';
import { canAccess } from './access-policy';
import type { Role } from './types';

/**
 * 事前場次調查(批A)伺服器端授權 helper。
 * 粗閘 canAccess('presurvey.view')(中心/委員/觀察員;機關與未知角色 fail-closed)之上,
 * 細粒度為「中心(全可)或本人(綁定帳號 userId===user.id)」——委員/觀察員只能操作自己那筆。
 */
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
