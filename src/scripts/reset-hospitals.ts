/**
 * 重測用「清空醫院資料」腳本(危險!需備份後再跑)。
 *
 *   npx tsx src/scripts/reset-hospitals.ts            # 乾跑:只列出將刪除的數量,不動資料
 *   npx tsx src/scripts/reset-hospitals.ts --confirm  # 實際執行刪除
 *
 * 範圍(對應使用者選項 B):
 *   刪除:所有醫院(Organization)、所有稽核週期(AuditCycle 及其 cascade 子表:檢核回應/委員意見/
 *         缺失/矯正/審查/用印報告/資料準備需求+繳交/狀態轉換/委員指派/評分/發現/精靈進度)、
 *         所有佐證(Evidence)、所有邀請(Invitation)、所有機關管理員與稽核委員帳號(ORG_ADMIN/AUDITOR)。
 *   保留:中心(SUPER_ADMIN)帳號、檢核表題庫(ChecklistVersion/Item)、資料準備標準清單(PrepTemplate/Item)、
 *         引導式精靈範本(JourneyTemplate/Stage/Item)、Email 範本、公告、稽核軌跡(AuditLog,刪除帳號者改記 null)。
 *   說明:uploads/ 內的實體佐證檔不在此刪(僅清 DB 紀錄,孤兒檔留在磁碟,無功能影響)。
 */
import { prisma } from '../lib/db';

async function counts() {
  const [orgs, cycles, orgAdmins, auditors, supers, evidences, invites, deficiencies] = await Promise.all([
    prisma.organization.count(),
    prisma.auditCycle.count(),
    prisma.user.count({ where: { role: 'ORG_ADMIN' } }),
    prisma.user.count({ where: { role: 'AUDITOR' } }),
    prisma.user.count({ where: { role: 'SUPER_ADMIN' } }),
    prisma.evidence.count(),
    prisma.invitation.count(),
    prisma.deficiency.count(),
  ]);
  return { orgs, cycles, orgAdmins, auditors, supers, evidences, invites, deficiencies };
}

async function main() {
  const confirm = process.argv.includes('--confirm');
  const before = await counts();
  console.log('[reset] 目前資料:', JSON.stringify(before));
  console.log(
    `[reset] 將刪除:醫院 ${before.orgs}、週期 ${before.cycles}(含其下全部業務資料)、` +
    `機關管理員 ${before.orgAdmins}、稽核委員 ${before.auditors}、佐證 ${before.evidences}、邀請 ${before.invites}`,
  );
  console.log(`[reset] 將保留:中心(SUPER_ADMIN)帳號 ${before.supers}、檢核表題庫、資料準備標準清單、精靈範本、公告、Email 範本。`);

  if (!confirm) {
    console.log('\n[reset] 乾跑模式(未加 --confirm)。確認無誤後加 --confirm 才會實際刪除。');
    return;
  }

  console.log('\n[reset] 開始刪除…');
  // 1. 佐證(多型,無 FK 依賴)
  const ev = await prisma.evidence.deleteMany({});
  // 2. 稽核週期 → cascade 刪除其下所有子表
  const cyc = await prisma.auditCycle.deleteMany({});
  // 3. 邀請
  const inv = await prisma.invitation.deleteMany({});
  // 4. 機關/委員帳號:先把其在稽核軌跡的 actorId 設 null(保留軌跡、避免 FK),再刪帳號
  const victims = await prisma.user.findMany({
    where: { role: { in: ['ORG_ADMIN', 'AUDITOR'] } },
    select: { id: true },
  });
  const victimIds = victims.map((v) => v.id);
  if (victimIds.length) {
    await prisma.auditLog.updateMany({ where: { actorId: { in: victimIds } }, data: { actorId: null } });
  }
  const usr = await prisma.user.deleteMany({ where: { role: { in: ['ORG_ADMIN', 'AUDITOR'] } } });
  // 5. 中心帳號脫離(即將刪除的)醫院,避免 FK 擋住
  await prisma.user.updateMany({ where: { role: 'SUPER_ADMIN' }, data: { organizationId: null } });
  // 6. 醫院:先清自我參照(母院)再刪全部
  await prisma.organization.updateMany({ data: { parentId: null } });
  const org = await prisma.organization.deleteMany({});

  console.log(`[reset] 已刪除:佐證 ${ev.count}、週期 ${cyc.count}、邀請 ${inv.count}、機關/委員帳號 ${usr.count}、醫院 ${org.count}`);
  const after = await counts();
  console.log('[reset] 完成後資料:', JSON.stringify(after));
  console.log('[reset] 重新大測試前置完成:可由中心帳號重新建立醫院、邀請人員、開立週期。');
}

main()
  .catch((e) => {
    console.error('[reset] 失敗:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
