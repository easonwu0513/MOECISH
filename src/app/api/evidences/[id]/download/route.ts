import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { assertEvidenceAccess } from '@/lib/rbac';
import { readFileByKey } from '@/lib/storage';
import { errorResponse } from '@/lib/api';

/** 圖片與 PDF 可用 ?inline=1 於瀏覽器內預覽(委員審查比對用);其餘一律下載。 */
const INLINE_MIME = /^(image\/(png|jpe?g|gif|webp)|application\/pdf)$/i;
/** 圖片一律 inline、不回 attachment(UAT 批40:圖片佐證關閉下載;UI 端 ProtectedFileLink 同步只給檢視器)。 */
const FORCE_INLINE_MIME = /^image\//i;

export async function GET(req: Request, { params }: { params: { id: string } }) {
  try {
    const e = await prisma.evidence.findUnique({ where: { id: params.id } });
    if (!e) return NextResponse.json({ error: 'not found' }, { status: 404 });
    // 驗證呼叫者對此佐證所屬週期有存取權(杜絕跨機關下載 IDOR)
    await assertEvidenceAccess(e.targetType, e.targetId);
    const buf = await readFileByKey(e.storageKey);
    const wantInline = new URL(req.url).searchParams.get('inline') === '1';
    const disposition =
      FORCE_INLINE_MIME.test(e.mimeType || '') || (wantInline && INLINE_MIME.test(e.mimeType || ''))
        ? 'inline'
        : 'attachment';
    return new NextResponse(new Uint8Array(buf), {
      status: 200,
      headers: {
        'content-type': e.mimeType || 'application/octet-stream',
        'content-disposition': `${disposition}; filename*=UTF-8''${encodeURIComponent(e.originalName)}`,
        'x-content-type-options': 'nosniff',
      },
    });
  } catch (err) {
    return errorResponse(err);
  }
}
