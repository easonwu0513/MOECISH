import { cn } from '@/lib/cn';

/**
 * C.I.S.H 機構徽章 — 教育部轄下醫療領域資訊安全推動中心。
 * 使用原版圖檔(/cish-logo.png,圓形透明遮罩),非重繪;favicon 為 src/app/icon.png。
 */
export function Logo({ size = 32, className }: { size?: number; className?: string }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src="/cish-logo.png"
      width={size}
      height={size}
      alt="C.I.S.H 教育部轄下醫療領域資訊安全推動中心"
      className={cn('select-none', className)}
      draggable={false}
    />
  );
}

export function Wordmark({ className, onDark }: { className?: string; onDark?: boolean }) {
  return (
    <span className={cn('inline-flex items-center gap-2.5', className)}>
      <Logo size={30} />
      <span className="flex flex-col leading-none gap-[3px]">
        <span className={cn('text-[0.9375rem] font-semibold tracking-tight', onDark ? 'text-white' : 'text-neutral-900')}>
          MOECISH
        </span>
        <span className={cn('text-[0.6875rem] tracking-[0.02em]', onDark ? 'text-white/75' : 'text-neutral-500')}>
          資通安全稽核管考平台
        </span>
      </span>
    </span>
  );
}
