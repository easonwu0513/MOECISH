import { Prisma } from '@prisma/client';
import { prisma } from './db';

/** 帶入發現的佔位文字偵測(批36):AuditPad「帶入」建立的發現含「(請補述…)」提示語,
 *  委員未補述前不得轉成正式缺失送給機關(佔位語外洩=把提示當缺失內容,批35 稽核 high)。 */
export const PLACEHOLDER_FINDING_RE = /[(（]請補述/;

/**
 * 缺失/發現描述是否「無效」(空白或仍為佔位文字),不可發布亦不可審核通過(批48 圖6)。
 * 原佔位閘僅在「帶入發現→轉缺失」把關;手動開立/Excel 匯入/編修/審核通過均漏檢,
 * 導致佔位缺失可被發布並審核通過。以此共用判斷補齊各寫入路徑與審核路徑。
 */
export function isInvalidDeficiencyDescription(desc: string | null | undefined): boolean {
  return !desc || desc.trim().length === 0 || PLACEHOLDER_FINDING_RE.test(desc);
}

/**
 * 把週期內尚未轉換的「待改善/建議」稽核發現建立為缺失(共用核心):
 * - 法遵符合情形(COMPLIANCE)不轉
 * - 項次依構面×類型接續編號;原發現回填 deficiencyId 鎖定
 * 回傳轉換筆數。
 * @param db 可傳入交易 client(`$transaction`)以與呼叫端共用同一交易;預設用全域 prisma。
 */
/** 佔位發現擋轉的專用錯誤:呼叫端(finish/convert route)以 400 回給前端,訊息可直接顯示。 */
export class PlaceholderFindingsError extends Error {}

export async function convertFindingsToDeficiencies(
  cycleId: string,
  createdById: string,
  db: Prisma.TransactionClient = prisma,
) {
  // 只轉「現存指派委員」的發現:已移除委員留下的孤兒發現不得轉成正式缺失,否則
  // reviewerAuditorId 會指向已移除委員 → 機關端看到「幽靈委員」的缺失(縱深防禦,即使孤兒殘留亦不外洩)。
  const liveAuditorIds = (
    await db.auditorAssignment.findMany({ where: { cycleId }, select: { auditorId: true } })
  ).map((a) => a.auditorId);
  const pending = await db.auditFinding.findMany({
    where: {
      cycleId,
      deficiencyId: null,
      kind: { in: ['IMPROVE', 'SUGGEST'] },
      auditorId: { in: liveAuditorIds },
    },
    orderBy: [{ aspect: 'asc' }, { kind: 'asc' }, { createdAt: 'asc' }],
  });
  if (pending.length === 0) return 0;

  // 佔位閘(批36):任何待轉發現仍含「(請補述…)」佔位語 → 整批拒轉,列出項次供中心催補
  // (不做「靜默跳過」——漏轉部分發現會讓中心以為全轉了;fail-loud 才能促成補述)。
  const placeholders = pending.filter((f) => PLACEHOLDER_FINDING_RE.test(f.content));
  if (placeholders.length > 0) {
    const auditorIds = Array.from(new Set(placeholders.map((f) => f.auditorId)));
    const names = await db.user.findMany({ where: { id: { in: auditorIds } }, select: { id: true, name: true } });
    const nameOf = new Map(names.map((u) => [u.id, u.name]));
    const list = placeholders
      .slice(0, 8)
      .map((f) => `${nameOf.get(f.auditorId) ?? '委員'}${f.checklistRef ? `【${f.checklistRef}】` : ''}`)
      .join('、');
    throw new PlaceholderFindingsError(
      `${placeholders.length} 條帶入的發現尚未補述內容（仍為「請補述…」佔位文字），不可轉為正式缺失：${list}${placeholders.length > 8 ? '…' : ''}。請洽該委員補述或退件處理。`,
    );
  }

  const existing = await db.deficiency.groupBy({
    by: ['aspect', 'type'],
    where: { cycleId },
    _max: { itemNo: true },
  });
  const nextNo = new Map<string, number>();
  for (const g of existing) {
    nextNo.set(`${g.aspect}:${g.type}`, (g._max.itemNo ?? 0) + 1);
  }

  let converted = 0;
  for (const f of pending) {
    const key = `${f.aspect}:${f.kind}`;
    const itemNo = nextNo.get(key) ?? 1;
    nextNo.set(key, itemNo + 1);

    const def = await db.deficiency.create({
      data: {
        cycleId,
        aspect: f.aspect,
        type: f.kind, // IMPROVE / SUGGEST 與 DeficiencyType 同值
        itemNo,
        description: f.content,
        checklistRef: f.checklistRef,
        createdById,
        reviewerAuditorId: f.auditorId, // 預設審閱委員=開立此發現的委員;中心可於缺失頁改指派其他委員
        action: { create: {} }, // 與手動建缺失一致;否則機關無法填報/送審矯正(閉環斷裂)
      },
    });
    await db.auditFinding.update({
      where: { id: f.id },
      data: { deficiencyId: def.id },
    });
    converted++;
  }
  return converted;
}
