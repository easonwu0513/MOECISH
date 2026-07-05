import { ReactNode } from 'react';
import { cn } from '@/lib/cn';

/**
 * 表格捲動容器:窄螢幕(筆電/平板)多欄表格不再擠壓溢出。
 * tabIndex=0 讓鍵盤使用者也能捲動。
 *
 * maxHeight(UIUX 稽核 #12):給定後容器改為雙軸捲動(overflow-auto)並限高,
 * 使內部 <THead sticky>/<Td stickyCol> 的黏著定位得以生效(黏著需相對一個「會捲動」的祖先;
 * 未限高時只有水平捲動,直向由整頁捲,thead 無法在容器內固定)。資料密集長表適用。
 */
export function TableScroll({
  children,
  minWidth = 760,
  maxHeight,
  className,
}: {
  children: ReactNode;
  minWidth?: number;
  /** 限高(px 或 CSS 長度如 '70vh');給定即啟用雙軸捲動,讓 sticky thead / 首欄凍結生效 */
  maxHeight?: number | string;
  className?: string;
}) {
  return (
    <div
      className={cn(maxHeight ? 'overflow-auto' : 'overflow-x-auto', 'scrollbar-thin focus-ring rounded-md', className)}
      style={maxHeight ? { maxHeight } : undefined}
      tabIndex={0}
      role="region"
      aria-label="資料表格(可捲動)"
    >
      <div style={{ minWidth }}>{children}</div>
    </div>
  );
}
