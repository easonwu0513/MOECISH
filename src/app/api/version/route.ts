import { NextResponse } from 'next/server';
import { APP_VERSION, BUILD_REV, BUILD_TIME } from '@/lib/version';
import { BASELINE } from '@/lib/security-baseline';

export const dynamic = 'force-dynamic';

/**
 * 公開版號端點:確認部署到位的 commit 與建置時間。
 * securityBaseline:讓維運自版號端點一眼確認防護基準(帳戶鎖定/限速/密碼複雜度/稽核鏈)是否真的啟用
 * (正式環境預設 true;顯式 SECURITY_BASELINE=0 才會是 false=需立即處理的錯誤組態)。
 */
export function GET() {
  return NextResponse.json({
    version: APP_VERSION,
    rev: BUILD_REV,
    builtAt: BUILD_TIME,
    securityBaseline: BASELINE.enabled,
  });
}
