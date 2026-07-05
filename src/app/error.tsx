'use client';

import { useEffect } from 'react';
import { Logo } from '@/components/brand/Logo';
import { Button } from '@/components/ui/Button';
import { AlertTriangle } from '@/components/icons';

/** 路由層錯誤邊界(取代 Next 預設英文錯誤頁)。reset() 重試該段渲染。 */
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // 後續可接觀測管線(Loki/Sentry);先確保非 production 可見
    console.error(error);
  }, [error]);

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-10 bg-paper-sunk">
      <div className="w-full max-w-[440px]">
        <div className="flex flex-col items-center mb-8">
          <Logo size={56} />
          <h1 className="mt-4 text-headline-sm text-ink-900">MOECISH</h1>
          <p className="mt-1.5 text-body-sm text-ink-500">資通安全稽核管考平台</p>
        </div>
        <div className="bg-card rounded-md shadow-elev-1 p-7 sm:p-8 border border-rule text-center">
          <div className="mx-auto w-14 h-14 rounded-full bg-danger-50 text-danger-600 flex items-center justify-center mb-4">
            <AlertTriangle size={26} />
          </div>
          <h2 className="text-title-lg text-ink-900">發生未預期的錯誤</h2>
          <p className="mt-2 text-body-sm text-ink-500">
            系統暫時無法處理您的請求，請重新整理，若持續發生請聯絡平台管理員。
          </p>
          <div className="mt-5 flex items-center justify-center gap-2">
            <Button onClick={() => reset()} variant="tonal" size="sm">重新整理</Button>
            <Button href="/dashboard" variant="text" size="sm">回總覽</Button>
          </div>
          {error.digest && (
            <p className="mt-4 text-caption font-mono text-ink-500">錯誤代碼 {error.digest}</p>
          )}
        </div>
      </div>
    </div>
  );
}
