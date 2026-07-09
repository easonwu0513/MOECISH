'use client';

import { useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';

/**
 * 視窗重獲焦點/切回分頁時重新整理伺服器資料(節流)。
 * 週期頁是多角色協作面:機關勾選待辦、繳交資料後,中心若停留在已開啟的舊畫面不會自己更新
 * (UAT 批41:機關勾了「下載文件範本」,中心視窗仍顯示未完成,誤以為要中心重勾)。
 * router.refresh() 只重取 server components,client 狀態(對話框/表單)保留,不打斷操作。
 */
export default function RefreshOnFocus({ minIntervalMs = 20000 }: { minIntervalMs?: number }) {
  const router = useRouter();
  // 初始化為現在:頁面剛渲染即是最新,首個 focus 不需重抓
  const last = useRef(Date.now());

  useEffect(() => {
    const maybeRefresh = () => {
      if (document.visibilityState !== 'visible') return;
      const now = Date.now();
      if (now - last.current < minIntervalMs) return;
      last.current = now;
      router.refresh();
    };
    window.addEventListener('focus', maybeRefresh);
    document.addEventListener('visibilitychange', maybeRefresh);
    return () => {
      window.removeEventListener('focus', maybeRefresh);
      document.removeEventListener('visibilitychange', maybeRefresh);
    };
  }, [router, minIntervalMs]);

  return null;
}
