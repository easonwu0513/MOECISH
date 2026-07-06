import { prisma } from './db';
import { auditorScoringComplete, parseAssignDimensions } from './audit-score';

/**
 * 全體受指派委員的實地稽核評分表是否皆已「定稿」且「真的完成應評構面」。
 * 兩道檢核:
 *  ① scoreLockedAt 全非空(退件會清空,故此即「已繳交且無退件」)。
 *  ② 縱深:定稿只是「按過確認鍵」的時間戳,與內容脫鉤;故再從 AuditScore 依委員責任構面
 *     重新驗算真的評了分——擋掉批63 完整性閘上線前的舊定稿、退件重鎖空表、或湊別構面過關
 *     (使用者回報:委員「已評 0 構面」卻已定稿、中心仍能「已完成年度稽核」的破口)。
 *
 * 供兩條抵達「缺失發布/完成稽核」的路徑共用同一前置,避免繞過:
 *  - 「已完成年度稽核」一鍵連動(api/cycles/[id]/audit/finish)
 *  - 手動推進至「缺失發布中(REPORT_ISSUED)」(api/cycles/[id]/transition)
 */
export async function auditorsFinalized(cycleId: string): Promise<{ ok: boolean; error?: string }> {
  const assignments = await prisma.auditorAssignment.findMany({
    where: { cycleId },
    select: { auditorId: true, scoreLockedAt: true, dimensions: true, auditor: { select: { name: true } } },
  });
  if (assignments.length === 0) {
    return { ok: false, error: '尚未指派稽核委員,無法完成年度稽核' };
  }
  const unfinalized = assignments.filter((a) => !a.scoreLockedAt).length;
  if (unfinalized > 0) {
    return {
      ok: false,
      error: `尚有 ${unfinalized} 位委員的評分表未定稿或已被退件,請待全體委員確認填寫完畢(定稿)後再發布缺失/完成稽核`,
    };
  }
  // ② 依責任構面重新驗算評分完整性(每構面題數以該檢核表版本為準,與 lock 閘同語彙)。
  const cycle = await prisma.auditCycle.findUnique({
    where: { id: cycleId },
    select: { checklistVersionId: true },
  });
  const itemGroups = cycle?.checklistVersionId
    ? await prisma.checklistItem.groupBy({
        by: ['dimension'],
        where: { versionId: cycle.checklistVersionId },
        _count: { _all: true },
      })
    : [];
  const totalByDim = new Map(itemGroups.map((g) => [g.dimension, g._count._all]));
  const scores = await prisma.auditScore.findMany({ where: { cycleId } });
  for (const a of assignments) {
    const mine = scores.filter((s) => s.auditorId === a.auditorId);
    if (!auditorScoringComplete(parseAssignDimensions(a.dimensions), mine, totalByDim)) {
      return {
        ok: false,
        error: `委員「${a.auditor.name}」已定稿但應評構面尚未完成評分,請於「彙整報告」對其「退件」、待委員補齊評分並重新定稿後再完成稽核`,
      };
    }
  }
  return { ok: true };
}
