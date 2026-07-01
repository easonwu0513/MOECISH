import { prisma } from './db';

/**
 * 全體受指派委員的實地稽核評分表是否皆已「定稿」(scoreLockedAt 非空)。
 * 退件會清空 scoreLockedAt(見 audit/return),故「scoreLockedAt 全非空」= 全體已繳交且無退件。
 *
 * 供兩條抵達「缺失發布/完成稽核」的路徑共用同一前置,避免繞過:
 *  - 「已完成年度稽核」一鍵連動(api/cycles/[id]/audit/finish)
 *  - 手動推進至「缺失發布中(REPORT_ISSUED)」(api/cycles/[id]/transition)
 */
export async function auditorsFinalized(cycleId: string): Promise<{ ok: boolean; error?: string }> {
  const locks = await prisma.auditorAssignment.findMany({
    where: { cycleId },
    select: { scoreLockedAt: true },
  });
  if (locks.length === 0) {
    return { ok: false, error: '尚未指派稽核委員,無法完成年度稽核' };
  }
  const unfinalized = locks.filter((a) => !a.scoreLockedAt).length;
  if (unfinalized > 0) {
    return {
      ok: false,
      error: `尚有 ${unfinalized} 位委員的評分表未定稿或已被退件,請待全體委員確認填寫完畢(定稿)後再發布缺失/完成稽核`,
    };
  }
  return { ok: true };
}
