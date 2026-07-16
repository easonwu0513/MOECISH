/**
 * 退回收件匣聚合 + 租戶隔離測試(DB-backed;需可連 DB,比照 test:isolation 於伺服器/本機跑):
 *   npm run test:returns
 *
 * 驗 getOpenReturns:四類退回(檢核表 reopen / 應備文件 INSUFFICIENT / 矯正 RETURNED / 用印退回)
 * 偵測正確,且 ORG_ADMIN 僅見自家、SUPER_ADMIN 見全機關、AUDITOR 回空(租戶隔離 —— 報告最擔心的回歸點)。
 * 以 RETTEST- 前綴建暫時夾具,跑完清理。
 */
import { prisma } from '../lib/db';
import { getOpenReturns } from '../lib/returns';
import type { ReturnKind } from '../lib/returns';

let pass = 0;
const fails: string[] = [];
function check(name: string, cond: boolean) {
  if (cond) pass++;
  else fails.push(name);
}

const PREFIX = 'RETTEST-';

async function cleanup() {
  const orgs = await prisma.organization.findMany({ where: { code: { startsWith: PREFIX } }, select: { id: true } });
  const orgIds = orgs.map((o) => o.id);
  const cycles = await prisma.auditCycle.findMany({ where: { organizationId: { in: orgIds } }, select: { id: true } });
  const cycleIds = cycles.map((c) => c.id);
  const defs = await prisma.deficiency.findMany({ where: { cycleId: { in: cycleIds } }, select: { id: true } });
  const acts = await prisma.correctiveAction.findMany({ where: { deficiencyId: { in: defs.map((d) => d.id) } }, select: { id: true } });
  await prisma.reviewRecord.deleteMany({ where: { actionId: { in: acts.map((a) => a.id) } } });
  await prisma.correctiveAction.deleteMany({ where: { deficiencyId: { in: defs.map((d) => d.id) } } });
  await prisma.deficiency.deleteMany({ where: { cycleId: { in: cycleIds } } });
  const reqs = await prisma.prepRequirement.findMany({ where: { cycleId: { in: cycleIds } }, select: { id: true } });
  await prisma.prepSubmission.deleteMany({ where: { requirementId: { in: reqs.map((r) => r.id) } } });
  await prisma.prepRequirement.deleteMany({ where: { cycleId: { in: cycleIds } } });
  const reports = await prisma.signedReport.findMany({ where: { cycleId: { in: cycleIds } }, select: { id: true } });
  await prisma.auditLog.deleteMany({ where: { entityType: 'SignedReport', entityId: { in: reports.map((r) => r.id) } } });
  await prisma.signedReport.deleteMany({ where: { cycleId: { in: cycleIds } } });
  await prisma.auditCycle.deleteMany({ where: { id: { in: cycleIds } } });
  await prisma.user.deleteMany({ where: { email: { startsWith: 'rettest-' } } });
  await prisma.organization.deleteMany({ where: { id: { in: orgIds } } });
}

async function main() {
  const version = await prisma.checklistVersion.findFirst({ where: { items: { some: {} } }, orderBy: { year: 'desc' } });
  if (!version) throw new Error('資料庫沒有任何含題目的檢核表版本,無法測試');

  console.log('[returns] 清理舊夾具…');
  await cleanup();
  console.log('[returns] 建立夾具(2 機關;甲院四類退回、乙院一類)…');

  const orgA = await prisma.organization.create({ data: { code: `${PREFIX}A`, name: '退回測試甲院' } });
  const orgB = await prisma.organization.create({ data: { code: `${PREFIX}B`, name: '退回測試乙院' } });
  const u = await prisma.user.create({
    data: { email: 'rettest-u@test.local', name: '退回測試員', passwordHash: 'x', role: 'SUPER_ADMIN', isActive: true },
  });
  const now = new Date();
  const mkCycle = (orgId: string, year: number, status: string) =>
    prisma.auditCycle.create({ data: { year, organizationId: orgId, checklistVersionId: version.id, status, startDate: now } });

  // 甲院:四類退回各一個週期(年度相異以滿足 @@unique[org,year])
  const cReopen = await mkCycle(orgA.id, 2091, 'PREPARATION');
  await prisma.auditCycle.update({ where: { id: cReopen.id }, data: { checklistReopenNote: '請補正第 3 題' } });

  const cPrep = await mkCycle(orgA.id, 2092, 'PREPARATION');
  const req = await prisma.prepRequirement.create({ data: { cycleId: cPrep.id, title: '資產清冊', category: 'ONSITE', orderIndex: 0 } });
  await prisma.prepSubmission.create({ data: { requirementId: req.id, status: 'INSUFFICIENT', reviewNote: '清冊不完整,請補', reviewedById: u.id, reviewedAt: now } });

  const cAction = await mkCycle(orgA.id, 2093, 'REMEDIATION');
  const def = await prisma.deficiency.create({ data: { cycleId: cAction.id, aspect: 'STRATEGY', type: 'IMPROVE', itemNo: 1, description: '缺失X', createdById: u.id } });
  const act = await prisma.correctiveAction.create({ data: { deficiencyId: def.id, status: 'RETURNED', round: 2 } });
  await prisma.reviewRecord.create({ data: { actionId: act.id, round: 1, decision: 'RETURN', comment: '措施不足,請補強', auditorId: u.id } });

  const cSigned = await mkCycle(orgA.id, 2094, 'REMEDIATION');
  const rep = await prisma.signedReport.create({ data: { cycleId: cSigned.id, fileKey: 'k', fileName: 'r.pdf', sha256: 'h', uploadedById: u.id } });
  await prisma.auditLog.create({ data: { action: 'SIGNED_REPORT_RETURN', entityType: 'SignedReport', entityId: rep.id } });

  // 乙院:一類(檢核表退回)——用於租戶隔離對照
  const bReopen = await mkCycle(orgB.id, 2091, 'PREPARATION');
  await prisma.auditCycle.update({ where: { id: bReopen.id }, data: { checklistReopenNote: '乙院請補正' } });

  const aCycleIds = new Set([cReopen.id, cPrep.id, cAction.id, cSigned.id]);
  const allTestCycleIds = new Set([...aCycleIds, bReopen.id]);
  const kinds = (arr: { kind: ReturnKind }[]) => new Set(arr.map((x) => x.kind));

  const aReturns = await getOpenReturns({ role: 'ORG_ADMIN', organizationId: orgA.id });
  const bReturns = await getOpenReturns({ role: 'ORG_ADMIN', organizationId: orgB.id });
  const superReturns = await getOpenReturns({ role: 'SUPER_ADMIN' });
  const auditorReturns = await getOpenReturns({ role: 'AUDITOR', organizationId: null });

  // 機關甲:恰 4 筆、四類齊全、且完全不含乙院(租戶隔離)
  check('甲院 ORG_ADMIN 見 4 筆退回', aReturns.length === 4);
  check('甲院四類齊全(checklist/prep/action/signed-report)',
    (['checklist', 'prep', 'action', 'signed-report'] as ReturnKind[]).every((k) => kinds(aReturns).has(k)));
  check('甲院結果完全不含乙院(租戶隔離)', aReturns.every((r) => aCycleIds.has(r.cycleId)));
  // 排序:無時戳(checklist reopen)置頂避免被埋沒,其餘有時戳者新→舊
  check('無時戳的檢核表退回置頂', aReturns[0].kind === 'checklist');

  // 機關乙:僅見自家 1 筆
  check('乙院 ORG_ADMIN 僅見自家 1 筆', bReturns.length === 1 && bReturns[0].cycleId === bReopen.id && bReturns[0].kind === 'checklist');

  // 中心:見全部測試退回(DB 可能另有他資料,故只驗「涵蓋 5 筆測試退回 + 含乙院」)
  const superTest = superReturns.filter((r) => allTestCycleIds.has(r.cycleId));
  check('SUPER_ADMIN 見全部 5 筆測試退回', superTest.length === 5);
  check('SUPER_ADMIN 看得到乙院退回(機關甲看不到的)', superReturns.some((r) => r.cycleId === bReopen.id));

  // 委員:退回非寄給委員,一律回空
  check('AUDITOR 回空陣列', auditorReturns.length === 0);
  // 機關無 organizationId → 回空(防未帶 org 時洩漏全庫)
  const orgNull = await getOpenReturns({ role: 'ORG_ADMIN', organizationId: null });
  check('ORG_ADMIN 無 organizationId 回空(不洩漏)', orgNull.length === 0);

  console.log('[returns] 清理夾具…');
  await cleanup();

  const total = pass + fails.length;
  console.log(`\n══ 退回收件匣測試:${pass}/${total} 通過 ══`);
  if (fails.length > 0) {
    console.log('未通過:');
    for (const f of fails) console.log(`  ✗ ${f}`);
    process.exitCode = 1;
  } else {
    console.log('四類退回偵測 + 租戶隔離(機關限自家 / 中心全機關 / 委員空 / 無 org 不洩漏)全數符合規格 ✓');
  }
}

main()
  .catch((e) => {
    console.error('[test:returns] 測試執行失敗:', e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
