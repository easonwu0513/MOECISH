import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireRole } from '@/lib/rbac';
import { saveBuffer } from '@/lib/storage';
import { errorResponse } from '@/lib/api';
import { writeAuditLog, extractRequestMeta } from '@/lib/audit-log';

/**
 * 公告附件上傳(SUPER_ADMIN;依使用者需求不限檔案格式,僅限大小 20MB)。
 * 圖片可插入內文(markdown ![]);下載端對非圖片一律 attachment+nosniff,
 * 瀏覽器不會當網頁執行,故不限格式不構成 XSS 面。
 */
export async function POST(req: Request, { params }: { params: { id: string } }) {
  try {
    const user = await requireRole('SUPER_ADMIN');
    const post = await prisma.post.findUnique({ where: { id: params.id }, select: { id: true, title: true } });
    if (!post) return NextResponse.json({ error: '公告不存在' }, { status: 404 });

    const fd = await req.formData();
    const file = fd.get('file') as File | null;
    if (!file) return NextResponse.json({ error: '缺少檔案' }, { status: 400 });
    if (file.size > 20 * 1024 * 1024) {
      return NextResponse.json({ error: '檔案超過 20MB 上限' }, { status: 400 });
    }

    const buf: Buffer = Buffer.from(await file.arrayBuffer());
    const saved = await saveBuffer(buf, `posts/${post.id}`, file.name);
    const item = await prisma.postAttachment.create({
      data: {
        postId: post.id,
        fileName: file.name,
        storageKey: saved.storageKey,
        mimeType: file.type || 'application/octet-stream',
        sizeBytes: saved.sizeBytes,
      },
      select: { id: true, fileName: true, mimeType: true, sizeBytes: true },
    });

    await writeAuditLog({
      actorId: user.id, action: 'POST_ATTACHMENT_UPLOAD', entityType: 'PostAttachment',
      entityId: item.id, after: { post: post.title, name: item.fileName, sizeBytes: item.sizeBytes },
      ...extractRequestMeta(req),
    });
    return NextResponse.json({ item });
  } catch (e) {
    return errorResponse(e);
  }
}
