import type { ReactNode } from 'react';
import Link from 'next/link';
import { Logo } from '@/components/brand/Logo';
import { ChevronLeft } from '@/components/icons';

/**
 * 入口頁統一版面(UIUX 稽核 #4;批73)—— 收斂 login / forgot-password / reset-password / invite
 * 四張「置中認證卡」原本手刻成的不一致配方(圓角 lg vs md、陰影 elev-2 vs 1、頁底 container-low vs surface、
 * ambient 有無不一、Logo/h1 尺寸各異)。入口頁是品牌第一印象與信任地基,四份配方任一次改版即分岔。
 *
 * 統一定案:頁底 surface-container-low + 常駐 --auth-ambient 漸層、卡片 rounded-lg / shadow-elev-2、
 * Logo 60、h1 text-headline。各頁只傳 title / subtitle / back / footer 與表單(children)。
 * 非 'use client':server(reset/invite)與 client(login/forgot)頁皆可包裹。
 * (註:另有同目錄零使用的 AuthShell=「已登入外殼」死碼,概念不同,本檔另立名避免混淆。)
 */
export function AuthLayout({
  title,
  subtitle,
  back,
  footer,
  children,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  /** 左上返回連結(login→前台首頁、forgot/reset→登入;invite 由信件進入不設) */
  back?: { href: string; label: string };
  /** 卡片下方的品牌/安全註腳(login 用) */
  footer?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="min-h-screen relative flex items-center justify-center px-4 py-10 overflow-hidden bg-surface-container-low">
      <div className="absolute inset-0 pointer-events-none" style={{ background: 'var(--auth-ambient)' }} aria-hidden />

      {back && (
        <Link
          href={back.href}
          className="absolute top-5 left-5 sm:top-7 sm:left-7 inline-flex items-center gap-1 h-10 pl-2.5 pr-4 rounded-full text-body-sm text-on-surface-variant hover:text-on-surface hover:bg-surface-container transition-colors duration-200 ease-standard focus-ring"
        >
          <ChevronLeft size={16} />
          {back.label}
        </Link>
      )}

      <div className="relative w-full max-w-[440px]">
        <div className="flex flex-col items-center text-center mb-8">
          <Logo size={60} />
          <h1 className="mt-4 text-headline text-on-surface">{title}</h1>
          {subtitle && <p className="mt-2 text-body-sm text-on-surface-variant">{subtitle}</p>}
        </div>

        <div className="relative bg-surface-container-lowest border border-outline-variant/60 rounded-lg shadow-elev-2 p-7 sm:p-8">
          {children}
        </div>

        {footer && (
          <div className="mt-6 flex items-center justify-center gap-1.5 text-caption text-on-surface-variant">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}
