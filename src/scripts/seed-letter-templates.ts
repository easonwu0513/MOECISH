/**
 * 信件範本庫（LetterTemplate）種子腳本 — 安全、冪等。
 *
 * 跑法：npm run letters:seed
 *
 * 設計原則（比照 seed-journey，與 db:seed 後門區隔）：
 *  - 只 upsert（依 templateKey），不刪除任何現有範本。
 *  - 冪等：已存在的 templateKey 只在「未被使用者編輯過」時才回填內容，避免覆寫後台編輯。
 *    以 updatedAt≈createdAt（<2 秒）判定「尚未編輯」；已編輯者僅補齊分類/排序等中繼欄位不動主旨內文。
 *  - 資料來源：src/data/letter-templates.json（自「信件範本工具」抽出，22 範本）。
 */
import { readFileSync } from 'fs';
import { join } from 'path';
import { prisma } from '../lib/db';

type RawTemplate = {
  id: string;
  category: string;
  workflowOrder: number;
  subGroup?: string;
  title: string;
  attachment?: string;
  audience?: string;
  subject: string;
  content: string;
};

async function main() {
  const raw = readFileSync(join(process.cwd(), 'src/data/letter-templates.json'), 'utf8');
  const data = JSON.parse(raw) as { templates: RawTemplate[] };
  let created = 0;
  let refreshed = 0;
  let preserved = 0;

  for (const t of data.templates) {
    const existing = await prisma.letterTemplate.findUnique({ where: { templateKey: t.id } });
    const meta = {
      category: t.category,
      workflowOrder: t.workflowOrder ?? 99,
      subGroup: t.subGroup ?? null,
      title: t.title,
      attachment: t.attachment ?? '無',
      audience: t.audience ?? '',
    };
    if (!existing) {
      await prisma.letterTemplate.create({
        data: { templateKey: t.id, ...meta, subject: t.subject, content: t.content },
      });
      created++;
      continue;
    }
    const edited = existing.updatedAt.getTime() - existing.createdAt.getTime() > 2000;
    if (edited) {
      // 已被編輯：只同步中繼欄位（分類/排序/子分組/附件/對象），保留使用者改過的主旨與內文。
      await prisma.letterTemplate.update({ where: { templateKey: t.id }, data: meta });
      preserved++;
    } else {
      // 尚未編輯：回填最新底稿全部欄位。
      await prisma.letterTemplate.update({
        where: { templateKey: t.id },
        data: { ...meta, subject: t.subject, content: t.content },
      });
      refreshed++;
    }
  }

  console.log(`[seed-letter-templates] created=${created} refreshed=${refreshed} preserved(edited)=${preserved} total=${data.templates.length}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
