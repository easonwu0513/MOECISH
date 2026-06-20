'use client';

import { ReactNode, useId } from 'react';
import { cn } from '@/lib/cn';
import { IconButton } from './IconButton';
import { X } from '../icons';
import { useDialogA11y } from './useDialogA11y';
import { usePresence } from './usePresence';

export function Sheet({
  open,
  onOpenChange,
  title,
  children,
  width = 'md',
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title?: ReactNode;
  children?: ReactNode;
  width?: 'sm' | 'md' | 'lg';
}) {
  const titleId = useId();
  const panelRef = useDialogA11y(open, () => onOpenChange(false));
  const { mounted, leaving } = usePresence(open, 250);

  if (!mounted) return null;

  const w = width === 'sm' ? 'max-w-sm' : width === 'lg' ? 'max-w-2xl' : 'max-w-md';

  return (
    <div
      className={cn('fixed inset-0 z-[90]', leaving ? 'animate-fade-out' : 'animate-fade-in')}
      role="dialog"
      aria-modal="true"
      aria-labelledby={title ? titleId : undefined}
    >
      <div
        className="absolute inset-0 scrim"
        onClick={() => onOpenChange(false)}
      />
      <div
        ref={panelRef}
        tabIndex={-1}
        className={cn(
          'absolute right-0 top-0 bottom-0 w-full bg-surface-container-high shadow-elev-5 flex flex-col outline-none',
          leaving ? 'animate-slide-out-right' : 'animate-slide-in-right',
          w,
        )}
      >
        <div className="flex items-center justify-between border-b border-outline-variant px-5 py-3.5">
          <h2 id={titleId} className="text-title-lg text-on-surface">{title}</h2>
          <IconButton icon={<X size={18} />} label="關閉" onClick={() => onOpenChange(false)} />
        </div>
        <div className="flex-1 overflow-y-auto scrollbar-thin p-5">{children}</div>
      </div>
    </div>
  );
}
