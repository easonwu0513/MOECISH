'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * 延遲卸載:open=false 時保留掛載 exitMs 毫秒,讓退場動畫播完才真正卸載。
 * 回傳 { mounted, leaving } —— mounted 控制是否 render,leaving 切換進/退場 class。
 * 退場對稱性(只有進場、關閉硬切 → 加退場)正是範本與 premium 的分水嶺。
 */
export function usePresence(open: boolean, exitMs: number): { mounted: boolean; leaving: boolean } {
  const [mounted, setMounted] = useState(open);
  const [leaving, setLeaving] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    if (open) {
      if (timer.current) clearTimeout(timer.current);
      setMounted(true);
      setLeaving(false);
    } else if (mounted) {
      setLeaving(true);
      timer.current = setTimeout(() => {
        setMounted(false);
        setLeaving(false);
      }, exitMs);
      return () => { if (timer.current) clearTimeout(timer.current); };
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  return { mounted, leaving };
}
