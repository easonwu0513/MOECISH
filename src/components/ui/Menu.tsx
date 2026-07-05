'use client';

import { useEffect, useId, useRef, useState, type ReactNode, type KeyboardEvent } from 'react';
import { cn } from '@/lib/cn';
import { Button } from './Button';
import { ChevronDown } from '../icons';

export type MenuItem = {
  label: ReactNode;
  /** 提供 href 渲染為 <a>(下載/導覽);否則以 onSelect 渲染 <button> */
  href?: string;
  onSelect?: () => void;
  icon?: ReactNode;
  download?: boolean | string;
  target?: string;
  disabled?: boolean;
};

type TriggerVariant = 'text' | 'tonal' | 'outlined' | 'ghost' | 'filled';

/**
 * 無障礙下拉選單(設計精緻化;批87)。收斂 PageHeader 工具列「一堆同階按鈕」為單一觸發 + 選單,
 * 消除按鈕過多的視覺擁擠並提供 overflow 收納。
 *
 * a11y:trigger aria-haspopup=menu / aria-expanded;panel role=menu、item role=menuitem;
 * 鍵盤 ↑/↓/Home/End 巡覽、Enter/Space 觸發、Esc 關閉並還焦 trigger、Tab 離開即關;
 * 開啟自動聚焦首項;點擊外部關閉(mousedown 判定容器外)。
 */
export function Menu({
  label,
  items,
  align = 'end',
  size = 'sm',
  variant = 'text',
  className,
}: {
  label: ReactNode;
  items: MenuItem[];
  align?: 'start' | 'end';
  size?: 'sm' | 'md';
  variant?: TriggerVariant;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const itemRefs = useRef<(HTMLAnchorElement | HTMLButtonElement | null)[]>([]);
  const uid = useId();

  const enabledIdx = items.map((it, i) => (it.disabled ? -1 : i)).filter((i) => i >= 0);

  // 點擊外部關閉
  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  // 開啟時聚焦首個可用項
  useEffect(() => {
    if (open && enabledIdx.length > 0) itemRefs.current[enabledIdx[0]]?.focus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  function close(focusTrigger = true) {
    setOpen(false);
    if (focusTrigger) triggerRef.current?.focus();
  }

  function focusAt(pos: number) {
    if (enabledIdx.length === 0) return;
    const wrapped = (pos + enabledIdx.length) % enabledIdx.length;
    itemRefs.current[enabledIdx[wrapped]]?.focus();
  }

  function currentPos(): number {
    const active = document.activeElement;
    const domIdx = itemRefs.current.findIndex((el) => el === active);
    return enabledIdx.indexOf(domIdx);
  }

  function onMenuKey(e: KeyboardEvent<HTMLDivElement>) {
    if (e.key === 'Escape') { e.preventDefault(); close(); }
    else if (e.key === 'ArrowDown') { e.preventDefault(); focusAt(currentPos() + 1); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); focusAt(currentPos() - 1); }
    else if (e.key === 'Home') { e.preventDefault(); focusAt(0); }
    else if (e.key === 'End') { e.preventDefault(); focusAt(enabledIdx.length - 1); }
    else if (e.key === 'Tab') { setOpen(false); }  // Tab 離開選單即關(不困住整頁焦點)
  }

  const itemCls =
    'flex items-center gap-2.5 w-full text-left px-3.5 h-9 text-body-sm text-on-surface ' +
    'hover:bg-surface-container focus:bg-surface-container outline-none focus-ring rounded-sm ' +
    'disabled:opacity-40 disabled:pointer-events-none';

  return (
    <div ref={rootRef} className={cn('relative inline-block', className)}>
      <Button
        ref={triggerRef}
        size={size}
        variant={variant}
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? `${uid}menu` : undefined}
        trailingIcon={<ChevronDown size={15} className={cn('transition-transform', open && 'rotate-180')} />}
      >
        {label}
      </Button>

      {open && (
        <div
          id={`${uid}menu`}
          role="menu"
          aria-label={typeof label === 'string' ? label : undefined}
          onKeyDown={onMenuKey}
          className={cn(
            'absolute z-50 mt-1 min-w-[13rem] rounded-md border border-outline-variant bg-surface-container-lowest shadow-elev-3 p-1',
            align === 'end' ? 'right-0' : 'left-0',
          )}
        >
          {items.map((it, i) => {
            const common = {
              role: 'menuitem' as const,
              tabIndex: -1,
              className: itemCls,
            };
            const body = (
              <>
                {it.icon && <span className="shrink-0 text-on-surface-variant">{it.icon}</span>}
                <span className="min-w-0 flex-1 truncate">{it.label}</span>
              </>
            );
            if (it.href) {
              return (
                <a
                  key={i}
                  ref={(el) => { itemRefs.current[i] = el; }}
                  href={it.disabled ? undefined : it.href}
                  download={it.download}
                  target={it.target}
                  rel={it.target === '_blank' ? 'noopener noreferrer' : undefined}
                  aria-disabled={it.disabled || undefined}
                  onClick={() => close(false)}
                  {...common}
                >
                  {body}
                </a>
              );
            }
            return (
              <button
                key={i}
                ref={(el) => { itemRefs.current[i] = el; }}
                type="button"
                disabled={it.disabled}
                onClick={() => { it.onSelect?.(); close(); }}
                {...common}
              >
                {body}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
