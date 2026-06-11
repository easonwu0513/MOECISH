import { ReactNode } from 'react';
import { cn } from '@/lib/cn';

/**
 * 表格水平捲動容器:窄螢幕(筆電/平板)多欄表格不再擠壓溢出。
 * tabIndex=0 讓鍵盤使用者也能捲動。
 */
export function TableScroll({
  children,
  minWidth = 760,
  className,
}: {
  children: ReactNode;
  minWidth?: number;
  className?: string;
}) {
  return (
    <div
      className={cn('overflow-x-auto scrollbar-thin focus-ring rounded-md', className)}
      tabIndex={0}
      role="region"
      aria-label="資料表格(可水平捲動)"
    >
      <div style={{ minWidth }}>{children}</div>
    </div>
  );
}
