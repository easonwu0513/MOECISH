import { NextResponse } from 'next/server';
import { APP_VERSION, BUILD_REV, BUILD_TIME } from '@/lib/version';

export const dynamic = 'force-dynamic';

/** 公開版號端點:確認部署到位的 commit 與建置時間(無敏感資訊)。 */
export function GET() {
  return NextResponse.json({ version: APP_VERSION, rev: BUILD_REV, builtAt: BUILD_TIME });
}
