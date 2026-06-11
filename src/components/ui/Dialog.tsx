'use client';

import { ReactNode, useEffect, useId, useRef } from 'react';
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
  icon,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title?: ReactNode;
  description?: ReactNode;
  children?: ReactNode;
  footer?: ReactNode;
  size?: 'sm' | 'md' | 'lg';
  icon?: ReactNode;
}) {
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const restoreFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;

    // 記住開啟前的焦點;關閉時還原(鍵盤使用者不迷路)
    restoreFocusRef.current = document.activeElement as HTMLElement | null;

    const panel = panelRef.current;
    const focusables = () =>
      Array.from(
        panel?.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ) ?? [],
      );

    // 初始焦點:第一個可聚焦元素,否則面板本身
    const first = focusables()[0];
    (first ?? panel)?.focus();

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onOpenChange(false);
        return;
      }
      // 焦點陷阱:Tab 在面板內循環,不跑到背景頁面
      if (e.key === 'Tab') {
        const els = focusables();
        if (els.length === 0) return;
        const firstEl = els[0];
        const lastEl = els[els.length - 1];
        if (e.shiftKey && document.activeElement === firstEl) {
          e.preventDefault();
          lastEl.focus();
        } else if (!e.shiftKey && document.activeElement === lastEl) {
          e.preventDefault();
          firstEl.focus();
        }
      }
    };
    window.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
      restoreFocusRef.current?.focus?.();
    };
  }, [open, onOpenChange]);

  if (!open) return null;

  const w = size === 'sm' ? 'max-w-sm' : size === 'lg' ? 'max-w-2xl' : 'max-w-md';

  return (
    <div
      className="fixed inset-0 z-[90] flex items-center justify-center p-4 animate-fade-in"
      role="dialog"
      aria-modal="true"
      aria-labelledby={title ? titleId : undefined}
    >
      <div
        className="absolute inset-0 bg-[rgba(20,20,30,0.32)] backdrop-blur-[2px]"
        onClick={() => onOpenChange(false)}
      />
      <div
        ref={panelRef}
        tabIndex={-1}
        className={cn(
          'relative w-full bg-surface-container-high rounded-lg shadow-elev-5 animate-slide-up outline-none',
          w,
        )}
      >
        {(icon || title || description) && (
          <div className="px-6 pt-6 text-center sm:text-left">
            {icon && (
              <div className="mb-4 inline-flex w-10 h-10 rounded-full bg-primary-container text-on-primary-container items-center justify-center">
                {icon}
              </div>
            )}
            {title && <h2 id={titleId} className="text-title-lg text-on-surface">{title}</h2>}
            {description && (
              <p className="mt-2 text-body-sm text-on-surface-variant leading-relaxed">{description}</p>
            )}
          </div>
        )}
        {children && <div className="px-6 py-5">{children}</div>}
        {footer && (
          <div className="px-6 pb-5 pt-3 flex items-center justify-end gap-2">
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
          <Button variant="text" onClick={() => onOpenChange(false)} disabled={loading}>
            {cancelLabel}
          </Button>
          <Button
            variant={tone === 'danger' ? 'danger' : tone === 'warning' ? 'warning' : 'filled'}
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
