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
      <body className="min-h-screen bg-paper-sunk text-neutral-900 antialiased">
        {/* 「跳到主要內容」skip-link 統一由 AppShell 提供(#main-content 在 AppShell 內),
            此處不再重複,避免雙重 skip-link 與導航時誤現。 */}
        <Providers>
          <ToastProvider>{children}</ToastProvider>
        </Providers>
      </body>
    </html>
  );
}
