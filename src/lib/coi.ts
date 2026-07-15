import { prisma } from './db';

/**
 * 利益迴避(COI)「曾任機關」政策旋鈕(批74)。
 *
 * 現行(選項3,預設):迴避僅看「現任連結」——被指派委員不得為該機關「現任」管理員
 *   (User.organizationId 或有效 ORG_ADMIN 授權)。曾任者(已卸任)不阻擋。
 * 未來(選項2):把常數設為數字 N,即啟用「卸任 N 年內曾任該機關管理員者亦迴避」。
 *   啟用只需改此常數;資料基礎為 admin/users 改角色時寫入的 endedAt UserRole 歷史列
 *   (見 api/admin/users/[id] PATCH 之「選項A」),以及 roles/promote 收回授權留下的歷史。
 *
 * ⚠️ 設為 null 時,hasFormerOrgAdminConflict 直接回 false(零 DB 查詢、零行為變動);
 *    設為數字時,assignments 指派閘會另查回溯窗內「已結束」之 ORG_ADMIN 授權並比照現任阻擋。
 *    政府旋轉門條款常用 3(年);實際採用與否為法遵/業務決定,故預設停用。
 */
export const COI_FORMER_ORG_LOOKBACK_YEARS: number | null = null;

/** 回溯窗起點(now 減 N 年);停用(常數為 null)時回 null。供 UserRole.endedAt 的 gte 過濾用。 */
export function formerOrgAdminSince(now: Date = new Date()): Date | null {
  if (COI_FORMER_ORG_LOOKBACK_YEARS === null) return null;
  const since = new Date(now);
  since.setFullYear(since.getFullYear() - COI_FORMER_ORG_LOOKBACK_YEARS);
  return since;
}

/**
 * 某員是否構成「曾任機關」迴避衝突(僅在選項2 啟用時有效)。
 * 查該員在回溯窗內、對 orgId「已結束」之 ORG_ADMIN 授權。停用時直接回 false,不查 DB。
 */
export async function hasFormerOrgAdminConflict(
  userId: string,
  orgId: string,
  now: Date = new Date(),
): Promise<boolean> {
  const since = formerOrgAdminSince(now);
  if (!since) return false; // 選項2 停用:零額外查詢、與現行(選項3)完全一致
  const n = await prisma.userRole.count({
    where: { userId, role: 'ORG_ADMIN', organizationId: orgId, endedAt: { gte: since } },
  });
  return n > 0;
}
