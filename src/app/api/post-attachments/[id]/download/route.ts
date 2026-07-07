import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireRole } from '@/lib/rbac';
import { readFileByKey } from '@/lib/storage';
import { errorResponse } from '@/lib/api';
import { postPubliclyVisible } from '@/lib/posts';

/** 僅圖片允許 inline(供公告內文 markdown 圖片嵌入);其餘一律 attachment,瀏覽器不會當網頁執行 */
const INLINE_MIME = /^image\/(png|jpe?g|gif|webp)$/i;

/**
 * 公告附件下載:前台可見公告=公開(前台公告本為公開頁,無登入要求;批33 圖4:此端點已於
 * middleware PUBLIC_PREFIX 放行,否則匿名訪客內文圖片與附件全 401);未上架者=僅最高管理員(編輯器預覽)。
 * 批33:可見性改用 postPubliclyVisible(含排程上下架時間窗),不再只看 status===PUBLISHED
 * ——否則「已排程尚未上架」或「已過排定下架」的附件仍會公開外洩。
 */
export async function GET(req: Request, { params }: { params: { id: string } }) {
  try {
    const att = await prisma.postAttachment.findUnique({
      where: { id: params.id },
      include: { post: { select: { status: true, publishedAt: true, unpublishAt: true } } },
    });
    if (!att) return NextResponse.json({ error: '附件不存在' }, { status: 404 });
    const visible = postPubliclyVisible(att.post);
    if (!visible) {
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
        // 前台可見附件供公開讀取,允許快取一小時(圖片嵌入內文時避免重複抓);未上架者不快取
        ...(visible ? { 'cache-control': 'public, max-age=3600' } : { 'cache-control': 'private, no-store' }),
      },
    });
  } catch (e) {
    return errorResponse(e);
  }
}
