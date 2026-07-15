import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireRole } from '@/lib/rbac';
import { errorResponse } from '@/lib/api';
import { saveBuffer, deleteFileByKey } from '@/lib/storage';
import { writeAuditLog, extractRequestMeta } from '@/lib/audit-log';

/**
 * 個別委員「去年舊版經歷說明書」(mockup 改版;僅中心上傳,供該委員參考、本人可下載)。
 * targetType=SURVEY_CV_PRIOR、targetId=participantId。一人一檔,重傳取代。屬中心提供之參考件,
 * 接受常見文件格式(Word/PDF 等),不加浮水印、不 magic-sniff(對比受調者本人繳交的 SURVEY_CV 走嚴格 sniff)。
 */
export async function POST(req: Request, { params }: { params: { id: string } }) {
  try {
    const user = await requireRole('SUPER_ADMIN');
    const participant = await prisma.surveyParticipant.findUnique({
      where: { id: params.id },
      select: { id: true, kind: true },
    });
    if (!participant) return NextResponse.json({ error: '受調人員不存在' }, { status: 404 });
    if (participant.kind !== 'MEMBER') {
      return NextResponse.json({ error: '僅委員有經歷說明書，觀察員無須提供舊版參考' }, { status: 400 });
    }

    const fd = await req.formData();
    const file = fd.get('file') as File | null;
    if (!file) return NextResponse.json({ error: '缺少檔案' }, { status: 400 });
    if (file.size > 20 * 1024 * 1024) {
      return NextResponse.json({ error: '檔案超過 20MB 上限' }, { status: 400 });
    }

    // 取代同人舊參考件(一人一檔)
    const old = await prisma.evidence.findMany({ where: { targetType: 'SURVEY_CV_PRIOR', targetId: participant.id } });
    for (const o of old) {
      await deleteFileByKey(o.storageKey).catch(() => {});
      await prisma.evidence.delete({ where: { id: o.id } }).catch(() => {});
    }

    const buf = Buffer.from(await file.arrayBuffer());
    const saved = await saveBuffer(buf, `evidences/SURVEY_CV_PRIOR/${participant.id}`, file.name);
    const item = await prisma.evidence.create({
      data: {
        targetType: 'SURVEY_CV_PRIOR',
        targetId: participant.id,
        fileName: saved.fileName,
        originalName: file.name,
        mimeType: file.type || 'application/octet-stream',
        sizeBytes: saved.sizeBytes,
        storageKey: saved.storageKey,
        sha256: saved.sha256,
        uploadedById: user.id,
      },
      select: { id: true, originalName: true },
    });

    await writeAuditLog({
      actorId: user.id,
      action: 'SURVEY_PRIOR_CV_UPLOAD',
      entityType: 'SurveyParticipant',
      entityId: participant.id,
      after: { evidenceId: item.id },
      ...extractRequestMeta(req),
    });

    return NextResponse.json({ item });
  } catch (e) {
    return errorResponse(e);
  }
}

/** 刪除某委員的舊版經歷說明書參考件(僅中心)。 */
export async function DELETE(req: Request, { params }: { params: { id: string } }) {
  try {
    const user = await requireRole('SUPER_ADMIN');
    const old = await prisma.evidence.findMany({ where: { targetType: 'SURVEY_CV_PRIOR', targetId: params.id } });
    if (old.length === 0) return NextResponse.json({ error: '無舊版參考件' }, { status: 404 });
    for (const o of old) {
      await deleteFileByKey(o.storageKey).catch(() => {});
      await prisma.evidence.delete({ where: { id: o.id } }).catch(() => {});
    }
    await writeAuditLog({
      actorId: user.id,
      action: 'SURVEY_PRIOR_CV_DELETE',
      entityType: 'SurveyParticipant',
      entityId: params.id,
      ...extractRequestMeta(req),
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
