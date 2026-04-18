import { cn } from '@/lib/cn';

export function Logo({ size = 32, className }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 40 40"
      fill="none"
      aria-label="MOECISH"
      className={className}
    >
      {/* Outer shield — soft rounded */}
      <path
        d="M20 3.5L32.5 7.8c.6.2 1 .8 1 1.5V19c0 8-5 14.2-12.4 16.3a1.8 1.8 0 01-1 0C12.5 33.2 7.5 27 7.5 19V9.3c0-.7.4-1.3 1-1.5L20 3.5z"
        fill="url(#moecish-shield)"
      />
      {/* Inner highlight */}
      <path
        d="M20 3.5L32.5 7.8c.6.2 1 .8 1 1.5V19c0 8-5 14.2-12.4 16.3a1.8 1.8 0 01-1 0C12.5 33.2 7.5 27 7.5 19V9.3c0-.7.4-1.3 1-1.5L20 3.5z"
        fill="url(#moecish-shine)"
        opacity="0.45"
      />
      {/* Check mark */}
      <path
        d="M13.6 20.2l4.2 4.2 8.6-10"
        stroke="#ffffff"
        strokeWidth="2.6"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
      <defs>
        <linearGradient id="moecish-shield" x1="6" y1="2" x2="34" y2="38" gradientUnits="userSpaceOnUse">
          <stop offset="0%"  stopColor="#5389bd" />
          <stop offset="55%" stopColor="#3a6ba0" />
          <stop offset="100%" stopColor="#27436a" />
        </linearGradient>
        <linearGradient id="moecish-shine" x1="10" y1="5" x2="20" y2="20" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#ffffff" stopOpacity="0.35" />
          <stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
        </linearGradient>
      </defs>
    </svg>
  );
}

export function Wordmark({ className }: { className?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-2.5', className)}>
      <Logo size={28} />
      <span className="flex flex-col leading-none gap-[3px]">
        <span className="text-[0.9375rem] font-semibold text-neutral-900 tracking-tight">MOECISH</span>
        <span className="text-[0.6875rem] text-neutral-500 tracking-[0.02em]">資安稽核管考平台</span>
      </span>
    </span>
  );
}
