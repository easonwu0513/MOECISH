'use client';

import { useEffect, useState } from 'react';
import { Paperclip, X } from '@/components/icons';

/**
 * 佐證檔連結。
 * - 委員(viewOnly=true):以站內檢視器開啟 —— 禁右鍵/禁拖曳,PDF 隱藏工具列下載鈕,不提供下載連結。
 *   (檔案本身已燒入機關浮水印 lib/watermark.ts,畫面另有 ScreenWatermark;瀏覽器無法 100% 防截圖,
 *    但移除「右鍵另存圖片/另存新檔」的便捷途徑,且留存可溯源浮水印。)
 * - 圖片檔:**所有角色一律僅站內檢視,不提供下載**(UAT 批40 裁定:機關上傳的圖片佐證不開放下載,
 *   與頁面「禁止外流」浮水印姿態一致)。
 * - 其餘角色的非圖片檔(機關/中心的 PDF/Office 等):維持新分頁預覽連結(可另存自家文件/工作底稿)。
 */
export function ProtectedFileLink({
  fileId,
  name,
  sizeKB,
  viewOnly,
  className,
}: {
  fileId: string;
  name: string;
  sizeKB?: number;
  viewOnly: boolean;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);
  const url = `/api/evidences/${fileId}/download?inline=1`;
  const isPdf = /\.pdf$/i.test(name);
  const isImage = /\.(png|jpe?g|gif|webp|bmp|avif)$/i.test(name);
  // 圖片一律視為僅檢視(關閉下載),其餘檔型依呼叫端角色決定
  const effectiveViewOnly = viewOnly || isImage;
  const base = className ?? 'inline-flex items-center gap-1.5 text-body-sm text-primary-700 hover:underline focus-ring rounded-sm';

  const label = (
    <>
      <Paperclip size={14} className="shrink-0" />
      <span className="truncate">{name}</span>
      {sizeKB != null && <span className="text-caption text-ink-500 tabular-nums shrink-0">({sizeKB} KB)</span>}
    </>
  );

  if (!effectiveViewOnly) {
    return (
      <a href={url} target="_blank" rel="noopener" className={base}>
        {label}
      </a>
    );
  }

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={base} title="僅供線上檢視(禁止下載/外流)">
        {label}
      </button>
      {open && (
        <div
          className="fixed inset-0 z-[70] flex flex-col bg-black/85"
          role="dialog"
          aria-modal="true"
          aria-label={`檢視 ${name}`}
          onContextMenu={(e) => e.preventDefault()}
          onDragStart={(e) => e.preventDefault()}
        >
          <div className="flex items-center justify-between gap-3 px-4 py-2.5 text-white shrink-0">
            <span className="text-body-sm truncate min-w-0">{name} · 僅供線上檢視,禁止下載與外流</span>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="shrink-0 p-1.5 rounded-full hover:bg-white/15 focus-ring"
              aria-label="關閉檢視"
            >
              <X size={20} />
            </button>
          </div>
          <div
            className="flex-1 min-h-0 overflow-auto px-4 pb-4 flex items-start justify-center select-none"
            onClick={(e) => { if (e.target === e.currentTarget) setOpen(false); }}
          >
            {isPdf ? (
              <iframe
                src={`${url}#toolbar=0&navpanes=0&scrollbar=0`}
                title={name}
                className="w-full h-full min-h-[82vh] rounded-sm bg-card"
              />
            ) : (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={url}
                alt={name}
                draggable={false}
                onDragStart={(e) => e.preventDefault()}
                className="max-w-full h-auto select-none rounded-sm bg-card"
              />
            )}
          </div>
        </div>
      )}
    </>
  );
}
