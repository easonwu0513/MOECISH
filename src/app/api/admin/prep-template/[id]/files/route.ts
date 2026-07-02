import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireRole } from '@/lib/rbac';
import { saveBuffer } from '@/lib/storage';
import { errorResponse } from '@/lib/api';
import { writeAuditLog, extractRequestMeta } from '@/lib/audit-log';
import { isTemplateUploadAllowed, TEMPLATE_UPLOAD_MAX_BYTES } from '@/lib/types';

/**
 * 標準清單項目「文件範本」上傳(SUPER_ADMIN 專用)。
 * 全站唯一允許 Word/Excel 等可編輯格式的上傳點:範本供機關下載依式填寫;
 * 機關端佐證上傳仍僅限 PDF/JPG/PNG(evidences 路由另行把關,不受此放寬影響)。
 */
export async function POST(req: Request, { params }: { params: { id: string } }) {
  try {
    const user = await requireRole('SUPER_ADMIN');
    const item = await prisma.prepTemplateItem.findUnique({ where: { id: params.id }, select: { id: true, title: true } });
    if (!item) return NextResponse.json({ error: '清單項目不存在' }, { status: 404 });

    const fd = await req.formData();
    const file = fd.get('file') as File | null;
    if (!file) return NextResponse.json({ error: '缺少檔案' }, { status: 400 });
    if (file.size > TEMPLATE_UPLOAD_MAX_BYTES) {
      return NextResponse.json({ error: '檔案超過 20MB 上限' }, { status: 400 });
    }
    // 允許清單:常見文件範本格式(含 Word/Excel/ODF);拒絕巨集啟用格式(docm/xlsm)、
    // 網頁/腳本與壓縮檔等(下載端一律 attachment + nosniff,此為縱深防禦第一層)
    if (!isTemplateUploadAllowed(file.name)) {
      return NextResponse.json(
        { error: '僅接受 Word(.doc/.docx)、Excel(.xls/.xlsx)、ODF(.odt/.ods)、PDF、CSV、JPG、PNG 格式的範本檔;不接受巨集啟用檔(.docm/.xlsm)與壓縮檔。' },
        { status: 400 },
      );
    }

    const buf: Buffer = Buffer.from(await file.arrayBuffer());
    const saved = await saveBuffer(buf, `prep-templates/${item.id}`, file.name);
    const created = await prisma.prepTemplateFile.create({
      data: {
        itemId: item.id,
        originalName: file.name,
        mimeType: file.type || 'application/octet-stream',
        sizeBytes: saved.sizeBytes,
        storageKey: saved.storageKey,
        sha256: saved.sha256,
        uploadedById: user.id,
      },
      select: { id: true, originalName: true, sizeBytes: true },
    });

    await writeAuditLog({
      actorId: user.id, action: 'PREP_TEMPLATE_FILE_UPLOAD', entityType: 'PrepTemplateFile',
      entityId: created.id, after: { item: item.title, name: created.originalName, sizeBytes: created.sizeBytes },
      ...extractRequestMeta(req),
    });
    return NextResponse.json({ item: created });
  } catch (e) {
    return errorResponse(e);
  }
}
