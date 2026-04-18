'use client';

import { ReactNode, useState } from 'react';
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
      className="relative inline-flex"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onFocus={() => setOpen(true)}
      onBlur={() => setOpen(false)}
    >
      {children}
      {open && (
        <span
          role="tooltip"
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
