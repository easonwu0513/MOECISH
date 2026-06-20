import type { Metadata } from 'next';
import { Inter, JetBrains_Mono, Noto_Sans_TC } from 'next/font/google';
import './globals.css';
import Providers from '@/components/Providers';
import { ToastProvider } from '@/components/ui/Toast';

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
  weight: ['400', '500', '600', '700'],
});

const mono = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-jetbrains',
  display: 'swap',
  weight: ['400', '500', '600'],
});

const noto = Noto_Sans_TC({
  subsets: ['latin'],
  variable: '--font-noto',
  weight: ['300', '400', '500', '600', '700'],
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'MOECISH · 資通安全稽核管考平台',
  description:
    '教育部轄下醫療領域資訊安全推動中心 — 醫療機構資通安全稽核管考平台:稽核前資料準備、檢核表線上填報、實地稽核數位化、缺失矯正管考,全流程一站完成。',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-Hant" className={`${inter.variable} ${mono.variable} ${noto.variable}`}>
      <body className="min-h-screen bg-surface text-neutral-900 antialiased">
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-[200] focus:px-4 focus:py-2 focus:rounded-md focus:bg-primary-container focus:text-on-primary-container focus:shadow-elev-3 focus-ring"
        >
          跳至主要內容
        </a>
        <Providers>
          <ToastProvider>{children}</ToastProvider>
        </Providers>
      </body>
    </html>
  );
}
