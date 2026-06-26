/**
 * 重測用「只清空稽核週期」腳本(危險!需備份後再跑)。保留醫院、所有帳號、題庫、標準清單、精靈範本。
 *
 *   npx tsx src/scripts/reset-cycles.ts            # 乾跑:只列出現有週期與將刪除的數量,不動資料
 *   npx tsx src/scripts/reset-cycles.ts --confirm  # 實際執行刪除
 *
 * 範圍:
 *   刪除:所有稽核週期(AuditCycle 及其 cascade 子表:檢核回應/委員意見/缺失/矯正/審查/評分/發現/
 *         資料準備需求+繳交/狀態轉換/委員指派/用印報告/精靈進度)、所有佐證(Evidence,多型,逐筆刪)。
 *   保留:醫院(Organization)、所有帳號(含機關/委員)、檢核表題庫、資料準備標準清單、精靈範本、
 *         公告、Email 範本、邀請、稽核軌跡(AuditLog;其 entityId 為字串非 FK,不受影響)。
 *   說明:uploads/ 內實體佐證檔不在此刪(僅清 DB 紀錄,孤兒檔留磁碟,無功能影響)。
 */
import { prisma } from '../lib/db';

async function counts() {
  const [orgs, cycles, evidences, deficiencies, responses, prepSubs, users] = await Promise.all([
    prisma.organization.count(),
    prisma.auditCycle.count(),
    prisma.evidence.count(),
    prisma.deficiency.count(),
    prisma.checklistResponse.count(),
    prisma.prepSubmission.count(),
    prisma.user.count(),
  ]);
  return { orgs, cycles, evidences, deficiencies, responses, prepSubs, users };
}

async function main() {
  const confirm = process.argv.includes('--confirm');
  const cycles = await prisma.auditCycle.findMany({
    include: { organization: { select: { name: true } } },
    orderBy: [{ organization: { name: 'asc' } }, { year: 'asc' }],
  });
  const before = await counts();

  console.log(`[reset-cycles] 現有稽核週期 ${cycles.length} 個:`);
  for (const c of cycles) {
    console.log(`  - ${c.organization.name} · ${c.year - 1911} 年度 · 狀態 ${c.status} (id=${c.id})`);
  }
  console.log(
    `[reset-cycles] 將刪除:週期 ${before.cycles}(含 cascade:檢核回應 ${before.responses}、缺失 ${before.deficiencies}、` +
    `資料準備繳交 ${before.prepSubs} 等)、佐證 ${before.evidences}。`,
  );
  console.log(`[reset-cycles] 保留:醫院 ${before.orgs}、帳號 ${before.users}、題庫、標準清單、精靈範本、公告、Email 範本、稽核軌跡。`);

  if (!confirm) {
    console.log('\n[reset-cycles] 乾跑模式(未加 --confirm)。確認無誤後加 --confirm 才會實際刪除。');
    return;
  }

  console.log('\n[reset-cycles] 開始刪除…');
  // 1. 佐證(多型,無 FK cascade,需先逐筆刪;所有佐證皆隸屬週期資料,全清)
  const ev = await prisma.evidence.deleteMany({});
  // 2. 稽核週期 → cascade 刪除其下所有子表
  const cyc = await prisma.auditCycle.deleteMany({});
  console.log(`[reset-cycles] 已刪除:佐證 ${ev.count}、週期 ${cyc.count}`);

  const after = await counts();
  console.log('[reset-cycles] 完成後資料:', JSON.stringify(after));
  console.log('[reset-cycles] 完成:醫院與帳號保留,可由中心重新開立週期。');
}

main()
  .catch((e) => {
    console.error('[reset-cycles] 失敗:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
