'use client';

import { ReactNode, useEffect } from 'react';
import { cn } from '@/lib/cn';
import { IconButton } from './IconButton';
import { X } from '../icons';

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
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onOpenChange(false);
    };
    window.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [open, onOpenChange]);

  if (!open) return null;

  const w = width === 'sm' ? 'max-w-sm' : width === 'lg' ? 'max-w-2xl' : 'max-w-md';

  return (
    <div className="fixed inset-0 z-[90] animate-fade-in" role="dialog" aria-modal="true">
      <div
        className="absolute inset-0 bg-[rgba(20,20,30,0.32)] backdrop-blur-[2px]"
        onClick={() => onOpenChange(false)}
      />
      <div
        className={cn(
          'absolute right-0 top-0 bottom-0 w-full bg-surface-container-high shadow-elev-5 flex flex-col animate-slide-in-right',
          w,
        )}
      >
        <div className="flex items-center justify-between border-b border-outline-variant px-5 py-3.5">
          <h2 className="text-title-lg text-on-surface">{title}</h2>
          <IconButton icon={<X size={18} />} label="關閉" onClick={() => onOpenChange(false)} />
        </div>
        <div className="flex-1 overflow-y-auto scrollbar-thin p-5">{children}</div>
      </div>
    </div>
  );
}
