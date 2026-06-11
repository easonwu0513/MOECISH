import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireUser, AuthError } from '@/lib/rbac';
import { readFileByKey } from '@/lib/storage';

/** 圖片與 PDF 可用 ?inline=1 於瀏覽器內預覽(委員審查比對用);其餘一律下載。 */
const INLINE_MIME = /^(image\/(png|jpe?g|gif|webp)|application\/pdf)$/i;

export async function GET(req: Request, { params }: { params: { id: string } }) {
  try {
    await requireUser();
    const e = await prisma.evidence.findUnique({ where: { id: params.id } });
    if (!e) return NextResponse.json({ error: 'not found' }, { status: 404 });
    const buf = await readFileByKey(e.storageKey);
    const wantInline = new URL(req.url).searchParams.get('inline') === '1';
    const disposition =
      wantInline && INLINE_MIME.test(e.mimeType || '') ? 'inline' : 'attachment';
    return new NextResponse(new Uint8Array(buf), {
      status: 200,
      headers: {
        'content-type': e.mimeType || 'application/octet-stream',
        'content-disposition': `${disposition}; filename*=UTF-8''${encodeURIComponent(e.originalName)}`,
        'x-content-type-options': 'nosniff',
      },
    });
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
