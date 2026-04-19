import { cn } from '@/lib/cn';

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
  tone?: 'primary' | 'sage' | 'success' | 'warning' | 'danger';
  label?: string;
  sublabel?: string;
  className?: string;
}) {
  const pct = Math.min(100, Math.max(0, (value / max) * 100));
  const r = (size - strokeWidth) / 2;
  const c = 2 * Math.PI * r;
  const offset = c - (pct / 100) * c;

  const color = {
    primary: 'stroke-primary-600',
    sage: 'stroke-sage-500',
    success: 'stroke-success-500',
    warning: 'stroke-warning-500',
    danger: 'stroke-danger-500',
  }[tone];

  return (
    <div className={cn('relative inline-flex items-center justify-center', className)} style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90" aria-hidden>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          className="stroke-surface-container-highest"
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
        {label && <span className="text-title-md text-on-surface leading-none tabular-nums">{label}</span>}
        {sublabel && <span className="text-caption text-on-surface-variant mt-1 tabular-nums">{sublabel}</span>}
      </div>
    </div>
  );
}
