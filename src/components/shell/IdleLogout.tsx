'use client';

import { useEffect, useRef, useState } from 'react';
import { signOut } from 'next-auth/react';
import { Dialog } from '@/components/ui/Dialog';
import { Button } from '@/components/ui/Button';

/**
 * 閒置自動登出(防護基準中級「帳號管理」:逾閒置時間系統自動登出)。
 * 以 NEXT_PUBLIC_SECURITY_BASELINE=1 啟用(build-time 旗標,與後端總開關同步設定);
 * 未啟用時不掛任何監聽,零行為差異。
 * 登出前 60 秒先跳警示(可「繼續使用」延長),避免作業中無預警被登出、遺失未存內容。
 */
const ENABLED = process.env.NEXT_PUBLIC_SECURITY_BASELINE === '1';
const IDLE_MINUTES = Number(process.env.NEXT_PUBLIC_SB_IDLE_MINUTES ?? '30') || 30;
const WARN_MS = 60000; // 登出前預警時間(60 秒)

export default function IdleLogout() {
  const idleTimer = useRef<ReturnType<typeof setTimeout>>();
  const logoutTimer = useRef<ReturnType<typeof setTimeout>>();
  const resetRef = useRef<() => void>(() => {});
  const [warning, setWarning] = useState(false);

  useEffect(() => {
    if (!ENABLED) return;

    // 第一段倒數(顯示警示前)= 總閒置時間扣掉預警秒數;避免設定過短時為負值。
    const preWarnMs = Math.max(IDLE_MINUTES * 60000 - WARN_MS, 0);

    const doLogout = () => {
      void signOut({ callbackUrl: '/login?idle=1' });
    };

    const clearTimers = () => {
      if (idleTimer.current) clearTimeout(idleTimer.current);
      if (logoutTimer.current) clearTimeout(logoutTimer.current);
    };

    // 重置閒置計時:關閉警示、清舊計時器,重新排「顯示警示」的第一段倒數;
    // 警示出現後排第二段倒數(WARN_MS),期間仍偵測互動(有互動即再次 reset,不會登出)。
    const reset = () => {
      clearTimers();
      setWarning(false);
      idleTimer.current = setTimeout(() => {
        setWarning(true);
        logoutTimer.current = setTimeout(doLogout, WARN_MS);
      }, preWarnMs);
    };
    resetRef.current = reset;

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
      clearTimers();
      for (const ev of events) window.removeEventListener(ev, onActivity);
    };
  }, []);

  // 「繼續使用」/ 關閉警示(Esc、點遮罩)皆視為使用者仍在座 → 重置閒置計時。
  const continueUsing = () => resetRef.current();

  return (
    <Dialog
      open={warning}
      onOpenChange={(o) => { if (!o) continueUsing(); }}
      size="sm"
      title="閒置提醒"
      description="因閒置即將登出,將於 60 秒後自動登出。"
      footer={<Button onClick={continueUsing}>繼續使用</Button>}
    />
  );
}
