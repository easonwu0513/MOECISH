/**
 * 只建「快速測試帳號 + 其所屬示範醫院」(密碼 demo1234),不灌週期/缺失/資料準備/公告。
 * 用於清空後重測的乾淨基線。冪等(upsert),可重跑。
 *
 *   npx tsx src/scripts/seed-test-accounts.ts
 *
 * 與 prisma/seed.ts 的帳號定義一致(只取帳號+醫院那段):
 *   admin@demo.tw  平台管理員  SUPER_ADMIN  (無所屬醫院)
 *   auditor@demo.tw 張稽核委員  AUDITOR     (無所屬醫院)
 *   org@demo.tw    林資安窗口  ORG_ADMIN   (示範大學附設醫院)
 *   org2@demo.tw   陳資安窗口  ORG_ADMIN   (示範醫學中心)
 */
import { prisma } from '../lib/db';
import bcrypt from 'bcryptjs';

async function main() {
  const org1 = await prisma.organization.upsert({
    where: { code: 'DEMO-HOSP-A' },
    update: {},
    create: { code: 'DEMO-HOSP-A', name: '示範大學附設醫院', shortName: '示範附醫' },
  });
  const org2 = await prisma.organization.upsert({
    where: { code: 'DEMO-HOSP-B' },
    update: {},
    create: { code: 'DEMO-HOSP-B', name: '示範醫學中心', shortName: '示範醫中' },
  });

  const hash = await bcrypt.hash('demo1234', 10);
  // 既有帳號(如 admin)不覆寫密碼,只校正角色/所屬醫院;新帳號才設 demo1234
  const mkUser = (email: string, name: string, role: string, organizationId: string | null) =>
    prisma.user.upsert({
      where: { email },
      create: { email, name, role, organizationId, passwordHash: hash, isActive: true },
      update: { role, organizationId, isActive: true },
    });

  await mkUser('admin@demo.tw', '平台管理員', 'SUPER_ADMIN', null);
  await mkUser('auditor@demo.tw', '張稽核委員', 'AUDITOR', null);
  await mkUser('org@demo.tw', '林資安窗口', 'ORG_ADMIN', org1.id);
  await mkUser('org2@demo.tw', '陳資安窗口', 'ORG_ADMIN', org2.id);

  const [orgs, supers, auditors, orgAdmins] = await Promise.all([
    prisma.organization.count(),
    prisma.user.count({ where: { role: 'SUPER_ADMIN' } }),
    prisma.user.count({ where: { role: 'AUDITOR' } }),
    prisma.user.count({ where: { role: 'ORG_ADMIN' } }),
  ]);
  console.log(`[seed-test-accounts] 完成。醫院 ${orgs}、中心 ${supers}、委員 ${auditors}、機關 ${orgAdmins}(密碼 demo1234)`);
}

main()
  .catch((e) => { console.error('[seed-test-accounts] 失敗:', e); process.exit(1); })
  .finally(() => prisma.$disconnect());
