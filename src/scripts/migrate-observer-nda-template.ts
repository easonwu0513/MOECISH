import { prisma } from '@/lib/db';
import { readFileByKey, saveBuffer } from '@/lib/storage';

/**
 * 一次性遷移(UAT 批G 觀察員公版切結書分流)。
 *
 * 背景:原委員/觀察員共用 NDA_BLANK 切結書範本;本批將觀察員切結書分出獨立槽 NDA_BLANK_OBSERVER。
 * 部署後、中心尚未上傳觀察員專用版之前,進行中年度的觀察員自助頁會暫時看不到任何切結書範本。
 * 本腳本為每個「已上傳 NDA_BLANK 且尚無 NDA_BLANK_OBSERVER」的年度,複製一份委員切結書作為觀察員切結書的過渡版本
 * (中心之後可於公版範本管理替換為觀察員專用版)。冪等:已存在觀察員槽者略過。
 */
async function main() {
  const ndaTemplates = await prisma.surveyTemplate.findMany({ where: { slot: 'NDA_BLANK' } });
  let created = 0;
  let skipped = 0;
  for (const nda of ndaTemplates) {
    const existingObs = await prisma.surveyTemplate.findFirst({
      where: { year: nda.year, slot: 'NDA_BLANK_OBSERVER' },
      select: { id: true },
    });
    if (existingObs) {
      skipped++;
      continue;
    }
    const ev = await prisma.evidence.findFirst({ where: { targetType: 'SURVEY_TEMPLATE', targetId: nda.id } });
    if (!ev) {
      // 無實體檔的空範本槽,不需複製(觀察員之後直接上傳即可)
      skipped++;
      continue;
    }

    const obsTpl = await prisma.surveyTemplate.create({
      data: {
        year: nda.year,
        slot: 'NDA_BLANK_OBSERVER',
        label: '空白保密切結書（觀察員）',
        uploadedById: nda.uploadedById,
      },
      select: { id: true },
    });
    const buf = await readFileByKey(ev.storageKey);
    const saved = await saveBuffer(buf, `evidences/SURVEY_TEMPLATE/${obsTpl.id}`, ev.originalName);
    await prisma.evidence.create({
      data: {
        targetType: 'SURVEY_TEMPLATE',
        targetId: obsTpl.id,
        fileName: saved.fileName,
        originalName: ev.originalName,
        mimeType: ev.mimeType,
        sizeBytes: saved.sizeBytes,
        storageKey: saved.storageKey,
        sha256: saved.sha256,
        uploadedById: nda.uploadedById,
      },
    });
    created++;
    console.log(`[migrate-obs-nda] year ${nda.year}: 已由 NDA_BLANK 複製建立 NDA_BLANK_OBSERVER 過渡範本`);
  }
  console.log(`[migrate-obs-nda] done. created ${created}, skipped ${skipped}`);
}

main()
  .catch((e) => {
    console.error('[migrate-obs-nda] failed:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
