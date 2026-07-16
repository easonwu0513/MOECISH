import Link from 'next/link';
import { Wordmark } from '@/components/brand/Logo';
import { Button } from '@/components/ui/Button';

/**
 * 前台共用頂欄(首頁/公告列表/公告詳情一致)。
 * 統一毛玻璃強度、底線深淺、登入按鈕文案(未登入「登入系統」/已登入「進入系統」)。
 */
export function PortalHeader({ authed }: { authed: boolean }) {
  const enterHref = authed ? '/dashboard' : '/login';
  const enterLabel = authed ? '進入系統' : '登入系統';
  return (
    <header className="sticky top-0 z-30 bg-card/90 backdrop-blur-md border-b border-rule/60">
      <div className="max-w-screen-xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
        <Link href="/" className="focus-ring rounded-md shrink-0">
          <Wordmark />
        </Link>
        <nav className="flex items-center gap-1">
          <Link
            href="/news"
            className="min-h-[44px] inline-flex items-center px-3 py-1.5 sm:px-4 sm:py-2 text-body-sm text-ink-500 hover:text-ink-900 transition-colors focus-ring rounded-full"
          >
            資安資訊
          </Link>
          <Link
            href="/news?category=EVENT"
            className="min-h-[44px] inline-flex items-center px-3 py-1.5 sm:px-4 sm:py-2 text-body-sm text-ink-500 hover:text-ink-900 transition-colors focus-ring rounded-full"
          >
            課程報名
          </Link>
          <Button href={enterHref} size="sm" className="ml-2">
            {enterLabel}
          </Button>
        </nav>
      </div>
    </header>
  );
}
