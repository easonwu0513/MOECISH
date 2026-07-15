import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { errorResponse } from '@/lib/api';
import { saveBuffer, deleteFileByKey } from '@/lib/storage';
import { writeAuditLog, extractRequestMeta } from '@/lib/audit-log';
import { loadParticipantForAccess } from '@/lib/pre-survey-server';
import { sniffDocType } from '@/lib/pre-survey-files';

const SlotSchema = z.enum(['CV', 'NDA']);

/**
 * 上傳個人文件(批B):CV=經歷說明書(僅委員)、NDA=聘任同意暨保密切結書。本人或中心可傳。
 *  - 已送審(docStatus=SUBMITTED)鎖定,不可再傳(需中心退補後);中心不受此限。
 *  - 一槽一檔:重新上傳同槽會取代舊檔(刪實體+DB 列)。僅接受 PDF/JPG/PNG(magic-byte 驗真型別,不加浮水印)。
 */
export async function POST(req: Request, { params }: { params: { id: string } }) {
  try {
    const { user, participant, isAdmin } = await loadParticipantForAccess(params.id);

    if (!isAdmin && participant.docStatus === 'SUBMITTED') {
      return NextResponse.json({ error: '文件已送審，如需修改請待中心退補後再上傳。' }, { status: 400 });
    }

    const fd = await req.formData();
    const file = fd.get('file') as File | null;
    const slotParsed = SlotSchema.safeParse(String(fd.get('slot') ?? ''));
    if (!file) return NextResponse.json({ error: '缺少檔案' }, { status: 400 });
    if (!slotParsed.success) return NextResponse.json({ error: '文件類別不正確' }, { status: 400 });
    const slot = slotParsed.data;

    if (slot === 'CV' && participant.kind !== 'MEMBER') {
      return NextResponse.json({ error: '觀察員無須繳交經歷說明書' }, { status: 400 });
    }
    if (file.size > 20 * 1024 * 1024) {
      return NextResponse.json({ error: '檔案超過 20MB 上限' }, { status: 400 });
    }

    const buf = Buffer.from(await file.arrayBuffer());
    const realMime = sniffDocType(buf);
    if (!realMime) {
      return NextResponse.json(
        { error: '僅接受 PDF / JPG / PNG 檔；Word、Excel 等請先另存為 PDF 再上傳。' },
        { status: 400 },
      );
    }

    const targetType = slot === 'CV' ? 'SURVEY_CV' : 'SURVEY_NDA';

    // 取代同槽舊檔(一槽一檔):刪實體 + DB 列
    const old = await prisma.evidence.findMany({ where: { targetType, targetId: participant.id } });
    for (const o of old) {
      await deleteFileByKey(o.storageKey).catch(() => {});
      await prisma.evidence.delete({ where: { id: o.id } }).catch(() => {});
    }

    const saved = await saveBuffer(buf, `evidences/${targetType}/${participant.id}`, file.name);
    const item = await prisma.evidence.create({
      data: {
        targetType,
        targetId: participant.id,
        fileName: saved.fileName,
        originalName: file.name,
        mimeType: realMime,
        sizeBytes: saved.sizeBytes,
        storageKey: saved.storageKey,
        sha256: saved.sha256,
        uploadedById: user.id,
      },
      select: { id: true, originalName: true, mimeType: true, sizeBytes: true },
    });

    await writeAuditLog({
      actorId: user.id,
      action: 'SURVEY_DOC_UPLOAD',
      entityType: 'SurveyParticipant',
      entityId: participant.id,
      after: { slot, evidenceId: item.id, byAdmin: isAdmin },
      ...extractRequestMeta(req),
    });

    return NextResponse.json({ item });
  } catch (e) {
    return errorResponse(e);
  }
}
