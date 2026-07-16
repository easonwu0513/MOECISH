import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

export const dynamic = 'force-dynamic';

/**
 * 健康檢查端點(公開;監控/反代健康探針用)。回報服務存活與 DB 連線狀態,不外洩任何業務資料。
 * DB 不通回 503,供上游探針判斷。
 */
export async function GET() {
  const rev = process.env.NEXT_PUBLIC_BUILD_REV ?? 'dev';
  let db: 'ok' | 'down' = 'ok';
  try {
    await prisma.$queryRaw`SELECT 1`;
  } catch {
    db = 'down';
  }
  return NextResponse.json(
    { status: db === 'ok' ? 'ok' : 'degraded', db, rev, time: new Date().toISOString() },
    { status: db === 'ok' ? 200 : 503 },
  );
}
