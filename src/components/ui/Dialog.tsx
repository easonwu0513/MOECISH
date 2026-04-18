'use client';

import { ReactNode, useEffect } from 'react';
import { cn } from '@/lib/cn';
import { Button } from './Button';

export function Dialog({
  open,
  onOpenChange,
  title,
  description,
  children,
  footer,
  size = 'md',
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title?: ReactNode;
  description?: ReactNode;
  children?: ReactNode;
  footer?: ReactNode;
  size?: 'sm' | 'md' | 'lg';
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

  const w = size === 'sm' ? 'max-w-sm' : size === 'lg' ? 'max-w-2xl' : 'max-w-md';

  return (
    <div
      className="fixed inset-0 z-[90] flex items-center justify-center p-4 animate-fade-in"
      role="dialog"
      aria-modal="true"
    >
      <div
        className="absolute inset-0 bg-neutral-900/25 backdrop-blur-[2px]"
        onClick={() => onOpenChange(false)}
      />
      <div
        className={cn(
          'relative w-full bg-white rounded-2xl shadow-lg border border-hairline animate-slide-up',
          w,
        )}
      >
        {(title || description) && (
          <div className="px-6 pt-6">
            {title && <h2 className="text-title-lg text-neutral-900">{title}</h2>}
            {description && (
              <p className="mt-2 text-body-sm text-neutral-600 leading-relaxed">{description}</p>
            )}
          </div>
        )}
        {children && <div className="px-6 py-5">{children}</div>}
        {footer && (
          <div className="px-6 pb-5 pt-4 flex items-center justify-end gap-2 border-t border-hairline">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}

export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = '確認',
  cancelLabel = '取消',
  onConfirm,
  tone = 'primary',
  loading,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: () => void | Promise<void>;
  tone?: 'primary' | 'danger' | 'warning';
  loading?: boolean;
}) {
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={title}
      description={description}
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={loading}>
            {cancelLabel}
          </Button>
          <Button
            variant={tone === 'danger' ? 'danger' : tone === 'warning' ? 'warning' : 'primary'}
            onClick={onConfirm}
            loading={loading}
          >
            {confirmLabel}
          </Button>
        </>
      }
    />
  );
}
