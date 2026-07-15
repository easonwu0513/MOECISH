import { prisma } from './db';
import { requireUser, AuthError } from './rbac';
import { canAccess } from './access-policy';
import type { Role } from './types';

/**
 * 事前場次調查(批B)個人文件(cv/切結書)僅接受 PDF/JPG/PNG(可站內預覽;不加浮水印——屬受調者本人文件)。
 * 以 magic bytes 判定真實型別,不信任副檔名/Content-Type。
 */
export function sniffDocType(buf: Buffer): 'application/pdf' | 'image/png' | 'image/jpeg' | null {
  if (buf.length >= 5 && buf[0] === 0x25 && buf[1] === 0x50 && buf[2] === 0x44 && buf[3] === 0x46) return 'application/pdf';
  if (buf.length >= 8 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return 'image/png';
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg';
  return null;
}

/**
 * 場次調查檔案(Evidence)存取授權:
 *  - SURVEY_TEMPLATE(公版範本):開放全體受調者(presurvey.view=中心/委員/觀察員)下載;
 *  - SURVEY_CV / SURVEY_NDA(個人文件):中心(全可)或本人(participant.userId===user.id)。
 * 回傳呼叫者 user。用於下載路由;上傳/刪除另由各路由以 loadParticipantForAccess 把關。
 */
export async function assertSurveyFileAccess(evidence: { targetType: string; targetId: string }) {
  const user = await requireUser();
  if (!canAccess('presurvey.view', user.role as Role, 'REMEDIATION')) {
    throw new AuthError(403, '無權存取此檔案');
  }
  if (evidence.targetType === 'SURVEY_TEMPLATE') return user; // 範本公開給全體受調者
  if (user.role === 'SUPER_ADMIN') return user;
  const p = await prisma.surveyParticipant.findUnique({
    where: { id: evidence.targetId },
    select: { userId: true },
  });
  if (!p) throw new AuthError(404, '對象不存在');
  if (p.userId !== user.id) throw new AuthError(403, '僅本人或中心可存取此檔案');
  return user;
}
