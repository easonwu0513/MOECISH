import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

/**
 * 機關工作流「狀態卡/導覽列」共用原子(UIUX 稽核 #5)。
 * 週期樞紐模組卡(StatusTile)與資料準備左側導覽列原各自手抄「圖示方框 + 狀態指示」
 * 配方(尺寸/圓角/色階略有出入 → 平行漂移)。這裡把三個會漂移的原子收斂為單一來源:
 *   ・TileIcon      —— 圖示方框外殼(rounded-md/置中/不縮);顏色由呼叫端帶入
 *   ・statusToneText —— 大字狀態值配色(StatusTile 的 n/N、已送出…)
 *   ・StatusPill    —— 小型狀態膠囊(側欄導覽列的狀態標)
 * 外層版面各自不同(儀表板網格卡 vs 側欄列 vs 待辦列)屬刻意差異,不強行併為單一元件。
 */

export function TileIcon({
  size = 36,
  className,
  children,
}: {
  size?: number;
  /** 顏色配方(如 bg-primary-50 text-primary-700 / bg-paper-sunk …) */
  className?: string;
  children: ReactNode;
}) {
  return (
    <span
      className={cn('flex shrink-0 items-center justify-center rounded-md', className)}
      style={{ width: size, height: size }}
    >
      {children}
    </span>
  );
}

/** 大字狀態值配色:done→綠、需注意→琥珀、當前→主色、其餘→中性。 */
export type StatusTextTone = 'default' | 'success' | 'warning' | 'primary';
export const statusToneText: Record<StatusTextTone, string> = {
  default: 'text-ink-900',
  success: 'text-success-700',
  warning: 'text-warning-600',
  primary: 'text-primary-700',
};

/** 小型狀態膠囊(側欄導覽列)。 */
export type PillTone = 'neutral' | 'success' | 'warning' | 'primary';
const PILL: Record<PillTone, string> = {
  neutral: 'bg-paper-sunk text-ink-500',
  success: 'bg-success-50 text-success-700',
  warning: 'bg-warning-50 text-warning-700',
  primary: 'bg-primary-50 text-primary-700',
};

export function StatusPill({
  tone = 'neutral',
  className,
  children,
}: {
  tone?: PillTone;
  className?: string;
  children: ReactNode;
}) {
  return (
    <span className={cn('inline-block rounded-full px-1.5 text-label-sm', PILL[tone], className)}>
      {children}
    </span>
  );
}
