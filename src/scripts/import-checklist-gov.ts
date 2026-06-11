/**
 * 匯入「115年資通安全實地稽核項目檢核表(公務機關)+ 法規對照」題庫。
 * 資料來源:prisma/seeds/checklist-115-gov.json
 * (由行政院檢核表 ODT 與教育部醫療資安推動中心法規對照表 DOCX v4.9 逐字解析合併,87 項次)
 *
 * 用法:npm run checklist:import-gov
 * 冪等:同名版本存在時,逐項 upsert(以 itemNo 對齊),不會重複建版本。
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { PrismaClient } from '@prisma/client';
import { dimensionFromItemNo } from '../lib/dimension';

const prisma = new PrismaClient();

const VERSION_NAME = '115年資通安全實地稽核項目檢核表(公務機關)';
const VERSION_YEAR = 2026; // 民國 115 年

type SeedItem = {
  itemNo: string;
  content: string;
  auditBasis: string;
  auditFocus: string;
  expectedEvidence: string;
};

async function main() {
  const file = path.join(process.cwd(), 'prisma', 'seeds', 'checklist-115-gov.json');
  const items: SeedItem[] = JSON.parse(readFileSync(file, 'utf-8'));
  console.log(`讀入 ${items.length} 項次`);

  let version = await prisma.checklistVersion.findFirst({ where: { name: VERSION_NAME } });
  if (!version) {
    version = await prisma.checklistVersion.create({
      data: { name: VERSION_NAME, year: VERSION_YEAR, isActive: true, publishedAt: new Date() },
    });
    console.log(`已建立題庫版本:${version.name}`);
  } else {
    console.log(`版本已存在,進行逐項更新:${version.name}`);
  }

  let created = 0;
  let updated = 0;
  for (let i = 0; i < items.length; i++) {
    const it = items[i];
    const data = {
      dimension: dimensionFromItemNo(it.itemNo),
      content: it.content,
      auditBasis: it.auditBasis,
      auditFocus: it.auditFocus,
      expectedEvidence: it.expectedEvidence,
      orderIndex: i,
    };
    const existing = await prisma.checklistItem.findUnique({
      where: { versionId_itemNo: { versionId: version.id, itemNo: it.itemNo } },
    });
    if (existing) {
      await prisma.checklistItem.update({ where: { id: existing.id }, data });
      updated++;
    } else {
      await prisma.checklistItem.create({
        data: { ...data, versionId: version.id, itemNo: it.itemNo },
      });
      created++;
    }
  }
  console.log(`完成:新增 ${created}、更新 ${updated}`);

  const count = await prisma.checklistItem.count({ where: { versionId: version.id } });
  console.log(`版本內項目總數:${count}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
