'use client';

import { useState } from 'react';
import { usePathname } from 'next/navigation';
import { MessageSquare, X } from '@/components/icons';
import { useToast } from '@/components/ui/Toast';
import { Button } from '@/components/ui/Button';

/**
 * 問題回饋(UAT 圖50,取代 AI 小幫手):右下角浮動鈕 → 小面板描述問題送出。
 * 自動帶入當前頁面路徑;送 POST /api/feedback 存檔,中心於 /admin/feedback 檢視處理。
 */
export function FeedbackWidget() {
  const pathname = usePathname();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [content, setContent] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit() {
    const text = content.trim();
    if (!text || busy) return;
    setBusy(true);
    try {
      const res = await fetch('/api/feedback', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ content: text, page: pathname }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({ error: '送出失敗' }));
        toast.error('送出失敗', (j as { error?: string }).error);
        return;
      }
      toast.success('已送出回饋', '感謝您的回報，中心將儘速處理。');
      setContent('');
      setOpen(false);
    } catch {
      toast.error('送出失敗', '連線逾時或網路中斷，請稍後再試');
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      {!open && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="開啟問題回饋"
          title="問題回饋"
          className="fixed bottom-5 right-5 z-50 inline-flex items-center justify-center w-11 h-11 rounded-full bg-primary-600 text-white shadow-elev-2 hover:bg-primary-700 transition-colors focus-ring print:hidden"
        >
          <MessageSquare size={19} aria-hidden />
        </button>
      )}

      {open && (
        <div className="fixed bottom-5 right-5 z-50 w-[min(92vw,380px)] flex flex-col rounded-lg border border-rule bg-card shadow-elev-3 overflow-hidden print:hidden">
          <div className="flex items-center gap-2 px-4 py-3 border-b border-rule bg-focus-wash">
            <span className="shrink-0 inline-flex items-center justify-center w-7 h-7 rounded-full bg-primary-600 text-white">
              <MessageSquare size={16} aria-hidden />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-title-md text-ink-900 leading-tight">問題回饋</p>
              <p className="text-label-sm text-ink-500">操作問題或建議，直接告訴中心</p>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="關閉"
              className="shrink-0 w-8 h-8 inline-flex items-center justify-center rounded-md text-ink-500 hover:bg-paper-sunk focus-ring"
            >
              <X size={18} aria-hidden />
            </button>
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              void submit();
            }}
            className="p-4 flex flex-col gap-3"
          >
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              rows={5}
              maxLength={2000}
              placeholder="請描述您遇到的問題或建議（會自動附上目前頁面，方便中心定位）…"
              className="w-full resize-none rounded-md border border-neutral-400 hover:border-neutral-500 bg-card px-3 py-2 text-body-sm text-ink-900 focus-ring"
            />
            <div className="flex items-center justify-between gap-2">
              <span className="text-caption text-ink-400 truncate" title={pathname}>頁面：{pathname}</span>
              <Button type="submit" size="sm" loading={busy} disabled={busy || !content.trim()}>送出</Button>
            </div>
          </form>
        </div>
      )}
    </>
  );
}
