import type { ReactNode } from 'react';
import { TONE, type Tone } from '@/lib/tone';

/**
 * 統計卡(頂色條 + 圖示圓 + 大數字 + 標題 + 一行說明)。
 * 總覽與週期首頁共用,確保三段式資訊層次一致(大數字 headline-sm/tabular-nums)。
 * 頂色條(批81)由 TONE.dot 派生(tertiary 非 Tone SoT 故特例保留),消本地 bar map。
 */
export function StatTopBar({
  tone,
  icon,
  primary,
  label,
  sub,
  muted,
}: {
  tone: 'primary' | 'success' | 'warning' | 'danger' | 'sage' | 'tertiary';
  icon: ReactNode;
  primary: string;
  label: string;
  sub: string;
  /** 警示色卡(危急類)值為 0 時降噪:頂條與圖示改中性,不誤導為「有待處理」 */
  muted?: boolean;
}) {
  const bar = muted ? 'bg-rule-strong'
    : tone === 'tertiary' ? 'bg-tertiary-500'   // tertiary 非 Tone SoT,特例保留
    : TONE[tone as Tone].dot;
  const iconBg = muted ? 'bg-paper-sunk text-ink-500' : {
    primary: 'bg-primary-50 text-primary-700',
    success: 'bg-success-50 text-success-700',
    warning: 'bg-warning-50 text-warning-700',
    danger: 'bg-danger-50 text-danger-700',
    sage: 'bg-sage-50 text-sage-700',
    tertiary: 'bg-tertiary-50 text-tertiary-700',
  }[tone];

  return (
    <div className="relative bg-card rounded-lg shadow-elev-1 overflow-hidden border border-rule">
      <div className={`h-1.5 ${bar}`} aria-hidden />
      <div className="p-5 flex items-center gap-4">
        <div className={`w-11 h-11 rounded-full flex items-center justify-center shrink-0 ${iconBg}`}>
          {icon}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-2">
            <span className="text-headline-sm font-semibold text-ink-900 tabular-nums">{primary}</span>
          </div>
          <div className="mt-0.5 text-body-sm text-ink-900 font-medium">{label}</div>
          <div className="text-caption text-ink-500 mt-0.5 truncate tabular-nums">{sub}</div>
        </div>
      </div>
    </div>
  );
}
