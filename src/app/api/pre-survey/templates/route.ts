import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { requireRole } from '@/lib/rbac';
import { errorResponse } from '@/lib/api';
import { saveBuffer, deleteFileByKey } from '@/lib/storage';
import { writeAuditLog, extractRequestMeta } from '@/lib/audit-log';
import { SURVEY_TEMPLATE_SLOTS, SURVEY_TEMPLATE_SLOT_LABELS, type SurveyTemplateSlot } from '@/lib/types';

/**
 * 上傳公版範本(批B;僅中心)。範本為空白表單(如經歷說明書/切結書 Word 或 PDF),受調者下載填寫。
 * 一年度一槽一檔:重傳同 (year, slot) 取代舊範本(刪 SurveyTemplate + 其 Evidence + 實體檔)。
 * 範本非機敏,接受常見文件格式,不加浮水印、不 magic-sniff。
 */
export async function POST(req: Request) {
  try {
    const user = await requireRole('SUPER_ADMIN');
    const fd = await req.formData();
    const file = fd.get('file') as File | null;
    const year = Number(fd.get('year'));
    const slotRaw = String(fd.get('slot') ?? '');
    const label = String(fd.get('label') ?? '').trim();

    if (!file) return NextResponse.json({ error: '缺少檔案' }, { status: 400 });
    if (!Number.isInteger(year) || year < 2000 || year > 2200) {
      return NextResponse.json({ error: '年度不正確' }, { status: 400 });
    }
    if (!(SURVEY_TEMPLATE_SLOTS as readonly string[]).includes(slotRaw)) {
      return NextResponse.json({ error: '範本類別不正確' }, { status: 400 });
    }
    const slot = slotRaw as SurveyTemplateSlot;
    if (file.size > 20 * 1024 * 1024) {
      return NextResponse.json({ error: '檔案超過 20MB 上限' }, { status: 400 });
    }

    // 取代同 (year, slot) 舊範本
    const existing = await prisma.surveyTemplate.findMany({ where: { year, slot }, select: { id: true } });
    for (const t of existing) {
      const evs = await prisma.evidence.findMany({ where: { targetType: 'SURVEY_TEMPLATE', targetId: t.id } });
      for (const ev of evs) {
        await deleteFileByKey(ev.storageKey).catch(() => {});
        await prisma.evidence.delete({ where: { id: ev.id } }).catch(() => {});
      }
      await prisma.surveyTemplate.delete({ where: { id: t.id } }).catch(() => {});
    }

    let template: { id: string };
    try {
      template = await prisma.surveyTemplate.create({
        data: { year, slot, label: label || SURVEY_TEMPLATE_SLOT_LABELS[slot], uploadedById: user.id },
        select: { id: true },
      });
    } catch (err) {
      // @@unique([year,slot]) 撞鍵(並發同槽上傳)→ 請重試
      if ((err as { code?: string }).code === 'P2002') {
        return NextResponse.json({ error: '此範本正被更新，請稍候重試。' }, { status: 409 });
      }
      throw err;
    }

    const buf = Buffer.from(await file.arrayBuffer());
    const saved = await saveBuffer(buf, `evidences/SURVEY_TEMPLATE/${template.id}`, file.name);
    await prisma.evidence.create({
      data: {
        targetType: 'SURVEY_TEMPLATE',
        targetId: template.id,
        fileName: saved.fileName,
        originalName: file.name,
        mimeType: file.type || 'application/octet-stream',
        sizeBytes: saved.sizeBytes,
        storageKey: saved.storageKey,
        sha256: saved.sha256,
        uploadedById: user.id,
      },
    });

    await writeAuditLog({
      actorId: user.id,
      action: 'SURVEY_TEMPLATE_UPLOAD',
      entityType: 'SurveyTemplate',
      entityId: template.id,
      after: { year, slot },
      ...extractRequestMeta(req),
    });

    return NextResponse.json({ template });
  } catch (e) {
    return errorResponse(e);
  }
}

const DeleteBody = z.object({ id: z.string().min(1) });

/** 刪除公版範本(批B;僅中心)。連帶刪其 Evidence + 實體檔。 */
export async function DELETE(req: Request) {
  try {
    const user = await requireRole('SUPER_ADMIN');
    const { id } = DeleteBody.parse(await req.json());

    const template = await prisma.surveyTemplate.findUnique({ where: { id }, select: { id: true } });
    if (!template) return NextResponse.json({ error: '範本不存在' }, { status: 404 });

    const evs = await prisma.evidence.findMany({ where: { targetType: 'SURVEY_TEMPLATE', targetId: id } });
    for (const ev of evs) {
      await deleteFileByKey(ev.storageKey).catch(() => {});
      await prisma.evidence.delete({ where: { id: ev.id } }).catch(() => {});
    }
    await prisma.surveyTemplate.delete({ where: { id } });

    await writeAuditLog({
      actorId: user.id,
      action: 'SURVEY_TEMPLATE_DELETE',
      entityType: 'SurveyTemplate',
      entityId: id,
      ...extractRequestMeta(req),
    });

    return NextResponse.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
