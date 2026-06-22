'use client';

/** 週期段級錯誤邊界:子段(prep/checklist/deficiencies…)渲染丟例外時,
 *  保留脈絡化復原(重試本頁/回總覽),不整站掉到泛用錯誤頁。 */
export default function CycleError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="min-h-[60vh] flex items-center justify-center px-6 py-12">
      <div className="max-w-md text-center">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-warning-50 text-warning-700">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z" />
            <line x1="12" y1="9" x2="12" y2="13" />
            <line x1="12" y1="17" x2="12.01" y2="17" />
          </svg>
        </div>
        <h2 className="text-title-lg text-on-surface mb-2">這個週期載入時發生問題</h2>
        <p className="text-body-sm text-on-surface-variant mb-6">可能是暫時性的連線或資料問題。請重試,或回到總覽再進入一次。</p>
        <div className="flex items-center justify-center gap-2">
          <button
            onClick={reset}
            className="inline-flex items-center justify-center rounded-full bg-primary-600 px-5 min-h-11 text-label-lg font-medium text-white hover:bg-primary-700 transition-colors focus-ring"
          >
            重試本頁
          </button>
          <a
            href="/dashboard"
            className="inline-flex items-center justify-center rounded-full px-5 min-h-11 text-label-lg font-medium text-on-surface-variant hover:bg-surface-container transition-colors focus-ring"
          >
            回總覽
          </a>
        </div>
      </div>
    </div>
  );
}
