import path from 'node:path';
import { existsSync } from 'node:fs';
import { prisma } from '../lib/db';
import { parseChecklistOdt } from './parse-odt';

async function main() {
  const REPO_ODT = path.join(__dirname, '..', '..', 'prisma', 'seeds', 'checklist-115.odt');
  const DESKTOP_ODT =
    'C:\\Users\\easonwu\\Desktop\\計畫附件1-1_115年資通安全實地稽核項目檢核表_適用公務機關.odt';
  const odtPath =
    process.argv[2] ??
    (existsSync(REPO_ODT) ? REPO_ODT : DESKTOP_ODT);
  const year = Number(process.argv[3] ?? 2026);

  console.log(`[import] ODT: ${odtPath}`);
  console.log(`[import] Year: ${year}`);

  const items = parseChecklistOdt(odtPath);
  console.log(`[import] 解析到 ${items.length} 題`);

  if (items.length < 80) {
    console.warn('[import] 題數少於 80，請檢查 ODT 是否正確');
  }

  const version = await prisma.checklistVersion.upsert({
    where: { year },
    create: { year, name: `${year - 1911} 年度資通安全實地稽核檢核表`, isActive: true, publishedAt: new Date() },
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

  console.log(`[import] 已寫入 ${items.length} 題到 ${year} 年版本`);
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
