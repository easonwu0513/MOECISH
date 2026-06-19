'use client';

import { ReactNode, useId, useState } from 'react';
import { cn } from '@/lib/cn';

export function Tooltip({
  content,
  children,
  side = 'top',
}: {
  content: ReactNode;
  children: ReactNode;
  side?: 'top' | 'bottom' | 'left' | 'right';
}) {
  const [open, setOpen] = useState(false);
  const tipId = useId();

  const pos =
    side === 'top'
      ? 'bottom-full left-1/2 -translate-x-1/2 mb-1.5'
      : side === 'bottom'
      ? 'top-full left-1/2 -translate-x-1/2 mt-1.5'
      : side === 'left'
      ? 'right-full top-1/2 -translate-y-1/2 mr-1.5'
      : 'left-full top-1/2 -translate-y-1/2 ml-1.5';

  return (
    <span
      className="relative inline-flex focus-ring rounded-sm"
      // tabIndex 讓鍵盤可聚焦觸發(含包覆非互動內容時,如「?」提示);
      // aria-describedby 讓螢幕報讀器把提示內容關聯到觸發點;Escape 可關閉。
      tabIndex={0}
      aria-describedby={open ? tipId : undefined}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onFocus={() => setOpen(true)}
      onBlur={() => setOpen(false)}
      onKeyDown={(e) => { if (e.key === 'Escape') setOpen(false); }}
    >
      {children}
      {open && (
        <span
          role="tooltip"
          id={tipId}
          className={cn(
            'pointer-events-none absolute z-50 px-2 py-1 rounded-md text-caption text-white bg-neutral-900 whitespace-nowrap shadow-md animate-fade-in',
            pos,
          )}
        >
          {content}
        </span>
      )}
    </span>
  );
}
