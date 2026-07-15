import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { readFileByKey } from '@/lib/storage';
import { errorResponse } from '@/lib/api';
import { assertSurveyFileAccess } from '@/lib/pre-survey-files';

/** 圖片與 PDF 可 ?inline=1 於瀏覽器內預覽;其餘一律下載。 */
const INLINE_MIME = /^(image\/(png|jpe?g|gif|webp)|application\/pdf)$/i;

/**
 * 下載/預覽事前場次調查檔案(批B):
 *  - SURVEY_CV / SURVEY_NDA:限本人或中心;SURVEY_TEMPLATE:開放全體受調者。
 * 授權由 assertSurveyFileAccess 依 targetType 把關(杜絕跨人 IDOR)。
 */
export async function GET(req: Request, { params }: { params: { id: string } }) {
  try {
    const e = await prisma.evidence.findUnique({ where: { id: params.id } });
    if (!e) return NextResponse.json({ error: 'not found' }, { status: 404 });
    if (e.targetType !== 'SURVEY_CV' && e.targetType !== 'SURVEY_NDA' && e.targetType !== 'SURVEY_TEMPLATE') {
      // 此路由僅供場次調查檔案;其餘走 /api/evidences
      return NextResponse.json({ error: '不支援的檔案類型' }, { status: 400 });
    }
    await assertSurveyFileAccess({ targetType: e.targetType, targetId: e.targetId });

    const buf = await readFileByKey(e.storageKey);
    const wantInline = new URL(req.url).searchParams.get('inline') === '1';
    const disposition = wantInline && INLINE_MIME.test(e.mimeType || '') ? 'inline' : 'attachment';
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
