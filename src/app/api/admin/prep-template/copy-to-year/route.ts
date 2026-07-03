import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { requireRole } from '@/lib/rbac';
import { errorResponse } from '@/lib/api';
import { writeAuditLog, extractRequestMeta } from '@/lib/audit-log';
import { readFileByKey, saveBuffer } from '@/lib/storage';

const Body = z.object({
  itemIds: z.array(z.string().min(10).max(40)).min(1).max(100),
  targetYear: z.number().int().min(2010).max(2100),
});

/**
 * 歷年標準清單「複製至今年」(UAT 批69;SUPER_ADMIN):
 * 把歷年檢視中的項目(單筆或整年)複製為 targetYear 的年度專屬項,含其文件範本檔——
 * 讓舊年度範本沿用到今年,不必重建項目、重上傳檔案。
 * 規則:
 *  - targetYear 已存在「同標題的年度項」→ 跳過(冪等可重按;年度覆寫語意=同名年度項只該有一個)。
 *  - 複製通用項=在 targetYear 建立同名年度覆寫(內容相同,範本檔固化到該年)。
 *  - 範本檔實體複製(read+save 至新項目 namespace),不共用 storageKey——日後任一邊刪除清理實體檔不互相影響。
 *  - 實體檔遺失等單檔錯誤不中斷整批,計入 fileErrors 回報。
 */
export async function POST(req: Request) {
  try {
    const user = await requireRole('SUPER_ADMIN');
    const { itemIds, targetYear } = Body.parse(await req.json());

    const sources = await prisma.prepTemplateItem.findMany({
      where: { id: { in: itemIds } },
      include: { files: true },
    });
    if (sources.length === 0) return NextResponse.json({ error: '找不到來源項目' }, { status: 404 });

    let copied = 0;
    let fileCopied = 0;
    let fileErrors = 0;
    const skippedTitles: string[] = [];

    for (const src of sources) {
      // 來源本身已是 targetYear 年度項(理論上唯讀歷年檢視不會給,API 防禦)→ 跳過
      if (src.year === targetYear) {
        skippedTitles.push(src.title);
        continue;
      }
      // 「查同名年度項→建立」收進可序列化交易(check-then-create TOCTOU,與批54/63 同家族):
      // 並行請求(單筆+一鍵、雙管理員)撞同名時,一方 P2034/查到即跳過,確保同名年度項只會有一筆;
      // 實體檔複製(慢 I/O)留在交易外,item 建立成功後才進行。
      let created: { id: string } | null = null;
      try {
        created = await prisma.$transaction(async (tx) => {
          const dup = await tx.prepTemplateItem.findFirst({
            where: { templateId: src.templateId, year: targetYear, title: src.title },
            select: { id: true },
          });
          if (dup) return null;
          const max = await tx.prepTemplateItem.aggregate({
            where: { templateId: src.templateId },
            _max: { orderIndex: true },
          });
          return tx.prepTemplateItem.create({
            data: {
              templateId: src.templateId,
              title: src.title,
              description: src.description,
              category: src.category,
              required: src.required,
              year: targetYear,
              orderIndex: (max._max.orderIndex ?? -1) + 1,
            },
            select: { id: true },
          });
        }, { isolationLevel: 'Serializable' });
      } catch (e) {
        // 序列化衝突=另一請求正在建同名項 → 視為已存在跳過(冪等)
        if ((e as { code?: string }).code === 'P2034') {
          skippedTitles.push(src.title);
          continue;
        }
        throw e;
      }
      if (!created) {
        skippedTitles.push(src.title);
        continue;
      }
      copied++;

      for (const f of src.files) {
        try {
          const buf = await readFileByKey(f.storageKey);
          const saved = await saveBuffer(buf, `prep-templates/${created.id}`, f.originalName);
          await prisma.prepTemplateFile.create({
            data: {
              itemId: created.id,
              originalName: f.originalName,
              mimeType: f.mimeType,
              sizeBytes: saved.sizeBytes,
              storageKey: saved.storageKey,
              sha256: saved.sha256,
              uploadedById: user.id,
            },
          });
          fileCopied++;
        } catch (err) {
          // 實體檔遺失/讀寫失敗:不中斷整批,如實回報(呼叫端提示部分範本未複製)
          console.error('[prep-template copy] 範本檔複製失敗:', f.storageKey, err);
          fileErrors++;
        }
      }
    }

    await writeAuditLog({
      actorId: user.id, action: 'PREP_TEMPLATE_COPY_TO_YEAR', entityType: 'PrepTemplate',
      entityId: sources[0].templateId,
      after: { targetYear, copied, skipped: skippedTitles.length, fileCopied, fileErrors },
      ...extractRequestMeta(req),
    });

    return NextResponse.json({ copied, skippedTitles, fileCopied, fileErrors });
  } catch (e) {
    return errorResponse(e);
  }
}
