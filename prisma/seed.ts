import path from 'node:path';
import { existsSync } from 'node:fs';
import bcrypt from 'bcryptjs';
import { prisma } from '../src/lib/db';
import { parseChecklistOdt } from '../src/scripts/parse-odt';

const YEAR = 2026;
const REPO_ODT = path.join(__dirname, 'seeds', 'checklist-115.odt');
const DESKTOP_ODT =
  'C:\\Users\\easonwu\\Desktop\\計畫附件1-1_115年資通安全實地稽核項目檢核表_適用公務機關.odt';
const ODT_PATH =
  process.env.CHECKLIST_ODT ??
  (existsSync(REPO_ODT) ? REPO_ODT : DESKTOP_ODT);

async function main() {
  console.log('[seed] 建立測試資料中...');

  // Organization
  const org = await prisma.organization.upsert({
    where: { code: 'DEMO-UNIV' },
    create: { code: 'DEMO-UNIV', name: '示範大學附設醫院', shortName: '示範醫院' },
    update: {},
  });
  console.log(`[seed] Organization: ${org.name}`);

  // Users
  const hash = await bcrypt.hash('demo1234', 10);
  const mkUser = (email: string, name: string, role: string, organizationId: string | null) =>
    prisma.user.upsert({
      where: { email },
      create: { email, name, role, organizationId, passwordHash: hash },
      update: {},
    });

  const admin = await mkUser('admin@demo.tw', '平台管理員', 'ADMIN', null);
  const auditor = await mkUser('auditor@demo.tw', '張稽核委員', 'AUDITOR', null);
  const respondent = await mkUser('respondent@demo.tw', '李填報人', 'RESPONDENT', org.id);
  const supervisor = await mkUser('supervisor@demo.tw', '王單位主管', 'SUPERVISOR', org.id);
  console.log('[seed] 已建立 4 個測試帳號 (密碼: demo1234)');

  // Checklist version + items
  let items: { itemNo: string; content: string; dimension: string }[] = [];
  try {
    items = parseChecklistOdt(ODT_PATH);
    console.log(`[seed] 從 ODT 解析到 ${items.length} 題`);
  } catch (e) {
    console.warn(`[seed] 無法讀 ODT (${(e as Error).message})，使用佔位內容`);
    const counts: Record<string, number> = {
      '1': 6, '2': 6, '3': 3, '4': 5, '5': 13, '6': 7, '7': 19, '8': 11, '9': 13,
    };
    const dimMap: Record<string, string> = {
      '1': 'CORE_BUSINESS', '2': 'POLICY_ORG', '3': 'STAFFING_BUDGET', '4': 'ASSET_RISK',
      '5': 'OUTSOURCING', '6': 'MAINTENANCE_KPI', '7': 'PROTECTION_CONTROL', '8': 'SYSTEM_DEV',
      '9': 'INCIDENT_RESPONSE',
    };
    items = [];
    for (const [major, n] of Object.entries(counts)) {
      for (let i = 1; i <= n; i++) {
        items.push({
          itemNo: `${major}.${i}`,
          content: `（第 ${major}.${i} 題內容，請從 ODT 匯入）`,
          dimension: dimMap[major],
        });
      }
    }
  }

  const version = await prisma.checklistVersion.upsert({
    where: { year: YEAR },
    create: {
      year: YEAR,
      name: `${YEAR - 1911} 年度資通安全實地稽核檢核表`,
      isActive: true,
      publishedAt: new Date(),
    },
    update: { isActive: true, publishedAt: new Date() },
  });

  let order = 0;
  for (const it of items) {
    await prisma.checklistItem.upsert({
      where: { versionId_itemNo: { versionId: version.id, itemNo: it.itemNo } },
      create: {
        versionId: version.id,
        itemNo: it.itemNo,
        dimension: it.dimension,
        content: it.content,
        orderIndex: order++,
      },
      update: { content: it.content, dimension: it.dimension, orderIndex: order++ },
    });
  }
  console.log(`[seed] 題庫已匯入 (${items.length} 題)`);

  // AuditCycle
  const now = new Date();
  const due = new Date(now.getTime() + 60 * 86400_000);
  const cycle = await prisma.auditCycle.upsert({
    where: { organizationId_year: { organizationId: org.id, year: YEAR } },
    create: {
      year: YEAR,
      organizationId: org.id,
      checklistVersionId: version.id,
      status: 'DRAFT',
      startDate: now,
      dueDate: due,
    },
    update: {},
  });
  console.log(`[seed] AuditCycle 建立 (${YEAR} 年, org=${org.name})`);

  // Auditor assignment
  await prisma.auditorAssignment.upsert({
    where: { cycleId_auditorId: { cycleId: cycle.id, auditorId: auditor.id } },
    create: { cycleId: cycle.id, auditorId: auditor.id, role: 'LEAD' },
    update: {},
  });

  console.log('\n[seed] ✓ 完成');
  console.log('\n測試帳號 (密碼皆為 demo1234):');
  console.log(`  ${admin.email}       管理員`);
  console.log(`  ${auditor.email}     稽核委員`);
  console.log(`  ${respondent.email}  填報人`);
  console.log(`  ${supervisor.email}  單位主管`);
  console.log(`\nCycle ID: ${cycle.id}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
