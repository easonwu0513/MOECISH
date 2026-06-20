'use client';

import { useEffect, useRef, type RefObject } from 'react';

const FOCUSABLE =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * 模態對話框/抽屜的共用無障礙行為,單一來源(原本只有 Dialog 有完整實作):
 *  - 開啟前記住焦點,關閉時還原(鍵盤使用者不迷路)
 *  - 初始焦點移入面板第一個可聚焦元素(否則面板本身)
 *  - Tab 焦點陷阱:在面板內循環,不跑到背景頁面
 *  - Escape 關閉
 *  - 背景捲動鎖定
 *
 * 回傳要掛在面板容器上的 ref(該容器需 tabIndex={-1} 以承接初始焦點)。
 * onClose 以 ref 穩住,effect 僅依 open 重跑 —— 避免父層每次 render 產生新 callback
 * 導致初始焦點被搶回(會中斷中文輸入法組字)。
 */
export function useDialogA11y(open: boolean, onClose: () => void): RefObject<HTMLDivElement> {
  const panelRef = useRef<HTMLDivElement>(null);
  const restoreFocusRef = useRef<HTMLElement | null>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!open) return;

    restoreFocusRef.current = document.activeElement as HTMLElement | null;

    const panel = panelRef.current;
    const focusables = () =>
      Array.from(panel?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? []);

    const first = focusables()[0];
    (first ?? panel)?.focus();

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onCloseRef.current();
        return;
      }
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
  }, [open]);

  return panelRef;
}
