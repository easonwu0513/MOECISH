import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireRole } from '@/lib/rbac';
import { readFileByKey } from '@/lib/storage';
import { errorResponse } from '@/lib/api';

/** 僅圖片允許 inline(供公告內文 markdown 圖片嵌入);其餘一律 attachment,瀏覽器不會當網頁執行 */
const INLINE_MIME = /^image\/(png|jpe?g|gif|webp)$/i;

/**
 * 公告附件下載:已發布公告=公開(前台公告本為公開頁,無登入要求);
 * 草稿/已下架=僅最高管理員(編輯器預覽用),避免未發布內容外洩。
 */
export async function GET(req: Request, { params }: { params: { id: string } }) {
  try {
    const att = await prisma.postAttachment.findUnique({
      where: { id: params.id },
      include: { post: { select: { status: true } } },
    });
    if (!att) return NextResponse.json({ error: '附件不存在' }, { status: 404 });
    if (att.post.status !== 'PUBLISHED') {
      await requireRole('SUPER_ADMIN');
    }
    const buf = await readFileByKey(att.storageKey);
    const wantInline = new URL(req.url).searchParams.get('inline') === '1';
    const disposition = wantInline && INLINE_MIME.test(att.mimeType || '') ? 'inline' : 'attachment';
    return new NextResponse(new Uint8Array(buf), {
      status: 200,
      headers: {
        'content-type': att.mimeType || 'application/octet-stream',
        'content-disposition': `${disposition}; filename*=UTF-8''${encodeURIComponent(att.fileName)}`,
        'x-content-type-options': 'nosniff',
        // 已發布附件供前台公開讀取,允許快取一小時(圖片嵌入內文時避免重複抓)
        ...(att.post.status === 'PUBLISHED' ? { 'cache-control': 'public, max-age=3600' } : {}),
      },
    });
  } catch (e) {
    return errorResponse(e);
  }
}
