'use client';

import { useEffect, useRef } from 'react';
import { signOut } from 'next-auth/react';

/**
 * 閒置自動登出(防護基準中級「帳號管理」:逾閒置時間系統自動登出)。
 * 以 NEXT_PUBLIC_SECURITY_BASELINE=1 啟用(build-time 旗標,與後端總開關同步設定);
 * 未啟用時不掛任何監聽,零行為差異。
 */
const ENABLED = process.env.NEXT_PUBLIC_SECURITY_BASELINE === '1';
const IDLE_MINUTES = Number(process.env.NEXT_PUBLIC_SB_IDLE_MINUTES ?? '30') || 30;

export default function IdleLogout() {
  const timer = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    if (!ENABLED) return;

    const reset = () => {
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => {
        void signOut({ callbackUrl: '/login?idle=1' });
      }, IDLE_MINUTES * 60000);
    };

    const events: (keyof WindowEventMap)[] = ['mousemove', 'mousedown', 'keydown', 'scroll', 'touchstart'];
    // mousemove 高頻 → 節流(每 5 秒最多重置一次即可,精度足夠)
    let last = 0;
    const onActivity = () => {
      const now = Date.now();
      if (now - last < 5000) return;
      last = now;
      reset();
    };

    for (const ev of events) window.addEventListener(ev, onActivity, { passive: true });
    reset();
    return () => {
      if (timer.current) clearTimeout(timer.current);
      for (const ev of events) window.removeEventListener(ev, onActivity);
    };
  }, []);

  return null;
}
