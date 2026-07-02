import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireUser } from '@/lib/rbac';
import { readFileByKey } from '@/lib/storage';
import { errorResponse } from '@/lib/api';

/**
 * 下載單一「文件範本」檔:登入使用者皆可(範本為空白制式表單,非機關資料,無租戶歸屬);
 * 一律 attachment(不 inline 預覽,Word/Excel 交由使用者本機程式開啟)+ nosniff。
 */
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  try {
    await requireUser();
    const f = await prisma.prepTemplateFile.findUnique({ where: { id: params.id } });
    if (!f) return NextResponse.json({ error: '範本檔不存在' }, { status: 404 });
    const buf = await readFileByKey(f.storageKey);
    return new NextResponse(new Uint8Array(buf), {
      status: 200,
      headers: {
        'content-type': f.mimeType || 'application/octet-stream',
        'content-disposition': `attachment; filename*=UTF-8''${encodeURIComponent(f.originalName)}`,
        'x-content-type-options': 'nosniff',
      },
    });
  } catch (e) {
    return errorResponse(e);
  }
}
