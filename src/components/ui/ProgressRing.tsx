import { cn } from '@/lib/cn';
import type { Tone } from '@/lib/tone';

export function ProgressRing({
  value,
  max = 100,
  size = 88,
  strokeWidth = 8,
  tone = 'primary',
  label,
  sublabel,
  className,
}: {
  value: number;
  max?: number;
  size?: number;
  strokeWidth?: number;
  tone?: Exclude<Tone, 'neutral'>;
  label?: string;
  sublabel?: string;
  className?: string;
}) {
  const pct = Math.min(100, Math.max(0, (value / max) * 100));
  const r = (size - strokeWidth) / 2;
  const c = 2 * Math.PI * r;
  const offset = c - (pct / 100) * c;

  // stroke 是 ProgressRing 專屬面向(TONE 為 bg/text 語彙);深淺基準對齊批72 統一實心 600
  const color = {
    primary: 'stroke-primary-600',
    sage: 'stroke-sage-600',
    success: 'stroke-success-600',
    warning: 'stroke-warning-600',
    danger: 'stroke-danger-600',
  }[tone];

  return (
    <div
      className={cn('relative inline-flex items-center justify-center', className)}
      style={{ width: size, height: size }}
      role="img"
      aria-label={`${label ? label + ' ' : ''}${sublabel ?? ''}(${Math.round(pct)}%)`}
    >
      <svg width={size} height={size} className="-rotate-90" aria-hidden>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          className="stroke-rule"
          strokeWidth={strokeWidth}
          fill="none"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          className={cn(color, 'transition-all duration-500 ease-emphasized-decel')}
          strokeWidth={strokeWidth}
          strokeDasharray={c}
          strokeDashoffset={offset}
          strokeLinecap="round"
          fill="none"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        {label && <span className="text-title-md text-ink-900 leading-none tabular-nums">{label}</span>}
        {sublabel && <span className="text-caption text-ink-500 mt-1 tabular-nums">{sublabel}</span>}
      </div>
    </div>
  );
}
