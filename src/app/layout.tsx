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
  description: '讓每一次稽核都清楚、從容、留得下軌跡',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-Hant" className={`${inter.variable} ${mono.variable} ${noto.variable}`}>
      <body className="min-h-screen bg-surface text-neutral-900 antialiased">
        <Providers>
          <ToastProvider>{children}</ToastProvider>
        </Providers>
      </body>
    </html>
  );
}
