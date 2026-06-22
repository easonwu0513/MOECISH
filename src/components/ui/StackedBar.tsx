import { cn } from '@/lib/cn';

export type StackSeg = {
  value: number;
  tone: 'success' | 'warning' | 'danger' | 'primary' | 'sage' | 'neutral';
  label?: string;
};

const TONE_BG: Record<StackSeg['tone'], string> = {
  success: 'bg-success-600',
  warning: 'bg-warning-500',
  danger: 'bg-danger-600',
  primary: 'bg-primary-600',
  sage: 'bg-sage-600',
  neutral: 'bg-outline-variant',
};

/**
 * 多段堆疊條(資料視覺化基元)。把「組成」一眼讀出 —— 例如檢核表 符合/不符合/未填。
 * 顏色一律走語意 token;空白餘額顯示為軌道底色。
 */
export function StackedBar({
  segments,
  total,
  height = 8,
  className,
}: {
  segments: StackSeg[];
  /** 分母;省略則為各段之和 */
  total?: number;
  height?: number;
  className?: string;
}) {
  const sum = total ?? segments.reduce((a, s) => a + s.value, 0);
  const aria = segments
    .filter((s) => s.value > 0)
    .map((s) => `${s.label ?? ''} ${s.value}`)
    .join('、');
  return (
    <div
      className={cn('w-full rounded-full bg-surface-container-high overflow-hidden flex', className)}
      style={{ height }}
      role="img"
      aria-label={aria || '尚無資料'}
    >
      {sum > 0 &&
        segments.map((s, i) =>
          s.value > 0 ? (
            <span
              key={i}
              className={cn('h-full', TONE_BG[s.tone])}
              style={{ width: `${(s.value / sum) * 100}%` }}
            />
          ) : null,
        )}
    </div>
  );
}
