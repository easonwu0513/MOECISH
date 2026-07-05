'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { IconButton } from '../ui/IconButton';
import { Bell } from '../icons';
import { cn } from '@/lib/cn';
import { fmtROC } from '@/lib/date';

type Notif = {
  id: string;
  kind: string;
  title: string;
  body: string | null;
  link: string | null;
  readAt: string | null;
  createdAt: string;
};

/** 相對時間(站內通知列;client 端可用 Date.now)。 */
function relTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return '剛剛';
  if (m < 60) return `${m} 分鐘前`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} 小時前`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d} 天前`;
  return fmtROC(iso); // 民國年(批72:原 toLocaleDateString 顯西曆)
}

/**
 * 站內通知鈴鐺:每封寄給本人的 email 會同步建立站內通知(見 lib/email.ts),
 * 此元件顯示未讀數徽章 + 下拉清單,點擊單筆即標為已讀並跳轉對應頁,避免漏看信件。
 */
export function NotificationBell() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<Notif[]>([]);
  const [unread, setUnread] = useState(0);

  const load = useCallback(async () => {
    const res = await fetch('/api/notifications').catch(() => null);
    if (!res || !res.ok) return;
    const j = await res.json().catch(() => null);
    if (j) {
      setItems(Array.isArray(j.items) ? j.items : []);
      setUnread(typeof j.unreadCount === 'number' ? j.unreadCount : 0);
    }
  }, []);

  // 載入時取一次 + 每 60 秒輪詢未讀;開啟下拉時再取最新
  useEffect(() => {
    load();
    const t = setInterval(load, 60000);
    return () => clearInterval(t);
  }, [load]);
  useEffect(() => { if (open) load(); }, [open, load]);

  async function markAll() {
    await fetch('/api/notifications/read', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}',
    }).catch(() => null);
    setItems((prev) => prev.map((n) => ({ ...n, readAt: n.readAt ?? new Date().toISOString() })));
    setUnread(0);
  }

  async function openItem(n: Notif) {
    if (!n.readAt) {
      fetch('/api/notifications/read', {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id: n.id }),
      }).catch(() => null);
      setUnread((u) => Math.max(0, u - 1));
      setItems((prev) => prev.map((x) => (x.id === n.id ? { ...x, readAt: new Date().toISOString() } : x)));
    }
    setOpen(false);
    if (n.link) router.push(n.link);
  }

  return (
    <div className="relative">
      <IconButton
        variant="standard"
        icon={<Bell size={20} />}
        label={unread > 0 ? `通知(${unread} 則未讀)` : '通知'}
        onClick={() => setOpen((o) => !o)}
      />
      {unread > 0 && (
        <span
          className="absolute top-1 right-1 min-w-[16px] h-4 px-1 rounded-full bg-danger-500 text-white text-[10px] leading-4 text-center font-semibold pointer-events-none tabular-nums"
          aria-hidden
        >
          {unread > 9 ? '9+' : unread}
        </span>
      )}
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} aria-hidden />
          <div
            role="dialog"
            aria-label="通知"
            className="absolute right-0 mt-2 w-[min(22rem,90vw)] z-50 rounded-lg border border-rule bg-card shadow-elev-3 overflow-hidden"
          >
            <div className="flex items-center justify-between px-4 py-2.5 border-b border-rule">
              <span className="text-title-md text-ink-900">通知</span>
              {unread > 0 && (
                <button onClick={markAll} className="text-caption text-primary-700 hover:underline focus-ring rounded px-1">
                  全部標為已讀
                </button>
              )}
            </div>
            <ul className="max-h-[60vh] overflow-y-auto divide-y divide-rule">
              {items.length === 0 ? (
                <li className="px-4 py-8 text-center text-body-sm text-ink-500">目前沒有通知</li>
              ) : (
                items.map((n) => (
                  <li key={n.id}>
                    <button
                      type="button"
                      onClick={() => openItem(n)}
                      className={cn(
                        'w-full text-left px-4 py-3 hover:bg-paper-sunk focus-ring flex gap-3',
                        !n.readAt && 'bg-primary-50/40',
                      )}
                    >
                      <span
                        className={cn('mt-1.5 shrink-0 w-2 h-2 rounded-full', n.readAt ? 'bg-transparent' : 'bg-primary-500')}
                        aria-hidden
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block text-body-sm font-medium text-ink-900">{n.title}</span>
                        {n.body && <span className="block mt-0.5 text-caption text-ink-500 line-clamp-2">{n.body}</span>}
                        <span className="block mt-1 text-label-sm text-ink-500">{relTime(n.createdAt)}</span>
                      </span>
                    </button>
                  </li>
                ))
              )}
            </ul>
          </div>
        </>
      )}
    </div>
  );
}
