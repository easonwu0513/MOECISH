import Link from 'next/link';
import type { ReactNode } from 'react';
import { PortalHeader } from './PortalHeader';
import { PortalFooter } from './PortalFooter';

/** 法律/政策頁共用外框(隱私權政策、服務條款、著作權聲明共用)。 */
export function LegalShell({
  authed,
  title,
  subtitle,
  children,
}: {
  authed: boolean;
  title: string;
  subtitle?: string;
  children: ReactNode;
}) {
  const rocYear = new Date().getFullYear() - 1911;
  return (
    <div className="min-h-screen bg-surface flex flex-col">
      <PortalHeader authed={authed} />
      <main id="main-content" className="flex-1 max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-10 w-full">
        <h1 className="text-headline text-on-surface">{title}</h1>
        {subtitle && <p className="mt-2 text-body-sm text-on-surface-variant">{subtitle}</p>}
        <div className="mt-4 flex items-start gap-2.5 rounded-md border border-warning-200 bg-warning-50 px-4 py-3 text-body-sm text-warning-800">
          <span aria-hidden>⚠</span>
          <span>
            本頁內容為<strong>草案</strong>,正式版本以教育部法務 / 個人資料保護窗口核定者為準;對外正式上線前須完成法務審閱。
          </span>
        </div>
        <div className="mt-8 space-y-7 leading-relaxed text-body text-on-surface [&_h2]:text-title-lg [&_h2]:mt-2 [&_h2]:mb-2 [&_p]:text-on-surface-variant [&_ul]:mt-1 [&_ul]:list-disc [&_ul]:space-y-1.5 [&_ul]:pl-5 [&_ul]:text-on-surface-variant [&_a]:text-primary-700 [&_a]:underline">
          {children}
        </div>
        <p className="mt-10 text-caption text-on-surface-variant">中華民國 {rocYear} 年版(草案)</p>
        <Link href="/" className="mt-3 inline-block text-body-sm text-primary-700 hover:underline focus-ring rounded-sm">
          ← 回首頁
        </Link>
      </main>
      <PortalFooter />
    </div>
  );
}
