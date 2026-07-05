import { cn } from '@/lib/cn';
import { TONE, type Tone } from '@/lib/tone';

/**
 * Material 3 LinearProgressIndicator.
 * Track on surface-container-highest; indicator 取自 lib/tone 的 fill 面向(批72 統一實心 600)。
 */
export function ProgressBar({
  value,
  max = 100,
  tone = 'primary',
  size = 'md',
  showLabel = false,
  label,
  className,
}: {
  value: number;
  max?: number;
  tone?: Exclude<Tone, 'neutral'>;
  size?: 'sm' | 'md';
  showLabel?: boolean;
  /** 讀屏用語意脈絡(批72 a11y):有值即設 aria-label,否則讀屏只念裸數字無脈絡 */
  label?: string;
  className?: string;
}) {
  const pct = Math.min(100, Math.max(0, (value / max) * 100));
  const toneBg = TONE[tone].fill;
  const h = size === 'sm' ? 'h-1' : 'h-1.5';

  return (
    <div className={cn('w-full', className)}>
      <div
        role="progressbar"
        aria-valuenow={value}
        aria-valuemin={0}
        aria-valuemax={max}
        aria-label={label}
        className={cn('w-full bg-surface-container-highest rounded-full overflow-hidden', h)}
      >
        <div
          className={cn('h-full rounded-full transition-all duration-300 ease-emphasized-decel', toneBg)}
          style={{ width: `${pct}%` }}
        />
      </div>
      {showLabel && (
        <div className="mt-1 flex justify-between text-caption text-on-surface-variant">
          <span>{Math.round(pct)}%</span>
          <span>{value} / {max}</span>
        </div>
      )}
    </div>
  );
}
