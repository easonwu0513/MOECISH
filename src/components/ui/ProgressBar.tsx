import { cn } from '@/lib/cn';

export function ProgressBar({
  value,
  max = 100,
  tone = 'primary',
  size = 'md',
  showLabel = false,
  className,
}: {
  value: number;
  max?: number;
  tone?: 'primary' | 'sage' | 'success' | 'warning' | 'danger';
  size?: 'sm' | 'md';
  showLabel?: boolean;
  className?: string;
}) {
  const pct = Math.min(100, Math.max(0, (value / max) * 100));
  const toneBg = {
    primary: 'bg-primary-600',
    sage: 'bg-sage-500',
    success: 'bg-success-500',
    warning: 'bg-warning-500',
    danger: 'bg-danger-500',
  }[tone];
  const h = size === 'sm' ? 'h-1.5' : 'h-2';

  return (
    <div className={cn('w-full', className)}>
      <div
        role="progressbar"
        aria-valuenow={value}
        aria-valuemin={0}
        aria-valuemax={max}
        className={cn('w-full bg-neutral-200 rounded-full overflow-hidden', h)}
      >
        <div
          className={cn('h-full rounded-full transition-all', toneBg)}
          style={{ width: `${pct}%` }}
        />
      </div>
      {showLabel && (
        <div className="mt-1 flex justify-between text-caption text-neutral-500">
          <span>{Math.round(pct)}%</span>
          <span>{value} / {max}</span>
        </div>
      )}
    </div>
  );
}
