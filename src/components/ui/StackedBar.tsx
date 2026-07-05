import { cn } from '@/lib/cn';
import { TONE, type Tone } from '@/lib/tone';

export type StackSeg = {
  value: number;
  tone: Tone;
  label?: string;
};

// 堆疊段填色取自 lib/tone 的 fill 面向(批72 統一實心 600;neutral=淺灰餘額)
const TONE_BG = (t: Tone) => TONE[t].fill;

/**
 * 多段堆疊條(資料視覺化基元)。把「組成」一眼讀出 —— 例如檢核表 符合/不符合/未填。
 * 顏色一律走語意 token;空白餘額顯示為軌道底色。
 */
export function StackedBar({
  segments,
  total,
  height = 8,
  legend,
  className,
}: {
  segments: StackSeg[];
  /** 分母;省略則為各段之和 */
  total?: number;
  height?: number;
  /** 是否在條下方顯示可見圖例(色票+標籤+數值);否則僅 aria-label */
  legend?: boolean;
  className?: string;
}) {
  const sum = total ?? segments.reduce((a, s) => a + s.value, 0);
  const aria = segments
    .filter((s) => s.value > 0)
    .map((s) => `${s.label ?? ''} ${s.value}`)
    .join('、');
  return (
    <div className={className}>
      <div
        className="w-full rounded-full bg-surface-container-high overflow-hidden flex"
        style={{ height }}
        role="img"
        aria-label={aria || '尚無資料'}
      >
        {sum > 0 &&
          segments.map((s, i) =>
            s.value > 0 ? (
              <span key={i} className={cn('h-full', TONE_BG(s.tone))} style={{ width: `${(s.value / sum) * 100}%` }} />
            ) : null,
          )}
      </div>
      {legend && (
        <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-label-sm text-on-surface-variant">
          {segments.map((s, i) =>
            s.label ? (
              <span key={i} className="inline-flex items-center gap-1.5">
                <span className={cn('w-2.5 h-2.5 rounded-sm shrink-0', TONE_BG(s.tone))} aria-hidden />
                {s.label} <span className="tabular-nums text-on-surface">{s.value}</span>
              </span>
            ) : null,
          )}
        </div>
      )}
    </div>
  );
}
