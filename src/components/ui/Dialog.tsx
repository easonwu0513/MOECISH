'use client';

import { ReactNode, useId } from 'react';
import { cn } from '@/lib/cn';
import { Button } from './Button';
import { useDialogA11y } from './useDialogA11y';
import { usePresence } from './usePresence';

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
  const descId = useId();
  const panelRef = useDialogA11y(open, () => onOpenChange(false));
  const { mounted, leaving } = usePresence(open, 200);

  if (!mounted) return null;

  const w = size === 'sm' ? 'max-w-sm' : size === 'lg' ? 'max-w-2xl' : 'max-w-md';

  return (
    <div
      className={cn(
        'fixed inset-0 z-[90] flex items-center justify-center p-4',
        leaving ? 'animate-fade-out' : 'animate-fade-in',
      )}
      role="dialog"
      aria-modal="true"
      aria-labelledby={title ? titleId : undefined}
      aria-describedby={description ? descId : undefined}
    >
      <div
        className="absolute inset-0 scrim"
        onClick={() => onOpenChange(false)}
      />
      <div
        ref={panelRef}
        tabIndex={-1}
        className={cn(
          // max-h + flex-col:長內容(或手機叫出鍵盤)時內容區捲動,標題/動作列恆可見,確認鈕不被推出畫面
          'relative w-full bg-surface-container-high rounded-lg shadow-elev-5 outline-none max-h-[85dvh] flex flex-col',
          leaving ? 'animate-slide-down-out' : 'animate-slide-up',
          w,
        )}
      >
        {(icon || title || description) && (
          <div className="px-6 pt-6 text-center sm:text-left shrink-0">
            {icon && (
              <div className="mb-4 inline-flex w-10 h-10 rounded-full bg-primary-container text-on-primary-container items-center justify-center">
                {icon}
              </div>
            )}
            {title && <h2 id={titleId} className="text-title-lg text-on-surface">{title}</h2>}
            {description && (
              <p id={descId} className="mt-2 text-body-sm text-on-surface-variant leading-relaxed">{description}</p>
            )}
          </div>
        )}
        {children && <div className="px-6 py-5 overflow-y-auto min-h-0">{children}</div>}
        {footer && (
          <div className="px-6 pb-5 pt-3 flex flex-wrap items-center justify-end gap-2 shrink-0">
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
