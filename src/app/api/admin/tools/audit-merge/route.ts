import { NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';
import { auth } from '@/lib/auth';

export const dynamic = 'force-dynamic';

/**
 * 稽核報告彙整工具(單檔 React 工具,SUPER_ADMIN 限定)。
 * 工具完全在瀏覽器端執行(localStorage 暫存),此路由僅負責
 * 驗證身分後回傳 HTML;不放 public/ 是為了不讓未登入者取得。
 */
export async function GET() {
  const session = await auth();
  if (!session || session.user.role !== 'SUPER_ADMIN') {
    return new NextResponse('Forbidden', { status: 403 });
  }
  const file = path.join(process.cwd(), 'src', 'assets', 'audit-merge-tool.html');
  const html = await fs.readFile(file, 'utf-8');
  return new NextResponse(html, {
    headers: {
      'content-type': 'text/html; charset=utf-8',
      'cache-control': 'no-store',
    },
  });
}
