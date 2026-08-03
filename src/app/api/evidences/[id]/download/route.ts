import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { assertEvidenceAccess, requireUser } from '@/lib/rbac';
import { readFileByKey } from '@/lib/storage';
import { errorResponse } from '@/lib/api';

/**
 * 佐證檔案下載/檢視(P0 安全批強化;圖60 延伸):
 *  - 型別判定以「檔案位元組 magic bytes」為準,不信任 DB mimeType(中心上傳路徑/舊資料未 sniff);
 *  - PDF 與圖片(png/jpg/gif/webp)一律 inline 且僅供站內檢視器取用(須 x-moecish-viewer 標頭,
 *    直開網址一律 403)——關閉「直開另存」;SVG 等其餘 image/* 不在白名單,絕不 inline(杜絕同源 XSS);
 *  - 委員/觀察員為唯讀審閱角色:白名單型別以外(Office 等)一律 403,不提供 attachment;
 *  - 機關/中心的非白名單型別維持 attachment(自家文件/工作底稿),以 octet-stream 供檔防 sniff 執行。
 */

/** 站內檢視器支援且可安全 inline 的型別(pdf.js / <img>);SVG 刻意排除。 */
function sniffInlineType(buf: Buffer): string | null {
  if (buf.length >= 4 && buf[0] === 0x25 && buf[1] === 0x50 && buf[2] === 0x44 && buf[3] === 0x46) return 'application/pdf'; // %PDF
  if (buf.length >= 4 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return 'image/png'; // PNG
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg'; // JPEG
  if (buf.length >= 6 && buf[0] === 0x47 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x38) return 'image/gif'; // GIF8
  if (
    buf.length >= 12 &&
    buf[0] === 0x52 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x46 &&
    buf[8] === 0x57 && buf[9] === 0x45 && buf[10] === 0x42 && buf[11] === 0x50
  ) return 'image/webp'; // RIFF....WEBP
  return null;
}

export async function GET(req: Request, { params }: { params: { id: string } }) {
  try {
    const user = await requireUser();
    const e = await prisma.evidence.findUnique({ where: { id: params.id } });
    if (!e) return NextResponse.json({ error: 'not found' }, { status: 404 });
    // 驗證呼叫者對此佐證所屬週期有存取權(杜絕跨機關下載 IDOR)
    await assertEvidenceAccess(e.targetType, e.targetId);
    const buf = await readFileByKey(e.storageKey);

    const inlineType = sniffInlineType(buf);
    if (inlineType) {
      // 站內檢視器專用:pdf.js/`<img>` 皆以 fetch 帶標頭取 blob;直開網址(無標頭)一律 403,
      // 徹底關閉「網址列直開→瀏覽器原生檢視→另存/下載鈕」路徑(所有角色一致)。
      if (req.headers.get('x-moecish-viewer') !== '1') {
        return NextResponse.json({ error: '此檔案僅供站內線上檢視，不提供下載。' }, { status: 403 });
      }
      return new NextResponse(new Uint8Array(buf), {
        status: 200,
        headers: {
          'content-type': inlineType,
          'content-disposition': `inline; filename*=UTF-8''${encodeURIComponent(e.originalName)}`,
          'x-content-type-options': 'nosniff',
          'cache-control': 'private, no-store',
        },
      });
    }

    // 非白名單型別(Office/SVG/其他):唯讀審閱角色(委員/觀察員)一律不提供
    if (user.role === 'AUDITOR' || user.role === 'OBSERVER') {
      return NextResponse.json({ error: '此檔案類型僅開放機關與中心下載。' }, { status: 403 });
    }
    return new NextResponse(new Uint8Array(buf), {
      status: 200,
      headers: {
        // 一律 octet-stream 供檔:不信任 DB mimeType,杜絕 SVG/HTML 等以本站 origin 被渲染執行
        'content-type': 'application/octet-stream',
        'content-disposition': `attachment; filename*=UTF-8''${encodeURIComponent(e.originalName)}`,
        'x-content-type-options': 'nosniff',
      },
    });
  } catch (err) {
    return errorResponse(err);
  }
}
