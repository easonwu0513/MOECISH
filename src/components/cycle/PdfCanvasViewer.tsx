'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * UAT 圖60:站內 PDF 檢視器——pdf.js 逐頁畫進 canvas,完全不經瀏覽器原生 PDF viewer
 * (原 iframe #toolbar=0 擋不住新版 Chrome 工具列與 iframe 內右鍵另存)。
 * 位元組以 fetch 帶 x-moecish-viewer 標頭取得(伺服器對 PDF 僅認此標頭,直開網址一律 403);
 * canvas 為本站 DOM,外層 onContextMenu 阻擋有效。誠實限制:內容已達瀏覽器,無法密碼學防存,
 * 但已無任何內建下載/列印/另存途徑,且檔案本身有浮水印可溯源。
 */
export function PdfCanvasViewer({ url, name }: { url: string; name: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        // legacy build:轉譯過的舊語法版——v6 主建置的新語法 Next 14 webpack 解析不了;
        // worker 走 /public 靜態檔(postinstall 自 node_modules 複製),不讓 webpack 打包 worker(會解析失敗)
        const pdfjs = (await import('pdfjs-dist/legacy/build/pdf.mjs')) as typeof import('pdfjs-dist');
        pdfjs.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs';
        const res = await fetch(url, { headers: { 'x-moecish-viewer': '1' } });
        if (!res.ok) throw new Error(String(res.status));
        const data = await res.arrayBuffer();
        const doc = await pdfjs.getDocument({ data }).promise;
        if (cancelled) return;
        const container = containerRef.current;
        if (!container) return;
        container.innerHTML = '';
        const width = Math.min(container.clientWidth || 800, 1000);
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        for (let i = 1; i <= doc.numPages; i += 1) {
          const page = await doc.getPage(i);
          if (cancelled) return;
          const base = page.getViewport({ scale: 1 });
          const scale = (width / base.width) * dpr;
          const vp = page.getViewport({ scale });
          const canvas = document.createElement('canvas');
          canvas.width = Math.floor(vp.width);
          canvas.height = Math.floor(vp.height);
          canvas.style.width = `${Math.floor(vp.width / dpr)}px`;
          canvas.style.height = `${Math.floor(vp.height / dpr)}px`;
          canvas.className = 'block mx-auto mb-3 bg-white rounded-sm select-none';
          canvas.oncontextmenu = (ev) => ev.preventDefault();
          container.appendChild(canvas);
          await page.render({ canvas, viewport: vp }).promise;
        }
        if (!cancelled) setState('ready');
      } catch {
        if (!cancelled) setState('error');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [url]);

  return (
    <div className="w-full">
      {state === 'loading' && <p className="py-10 text-center text-body-sm text-white/80">載入 {name} 中…</p>}
      {state === 'error' && <p className="py-10 text-center text-body-sm text-white/80">檔案載入失敗，請關閉後重試。</p>}
      <div ref={containerRef} onContextMenu={(e) => e.preventDefault()} onDragStart={(e) => e.preventDefault()} />
    </div>
  );
}

/**
 * P0 安全批:站內圖片檢視器——與 PDF 同以 fetch 帶 x-moecish-viewer 標頭取 blob
 * (伺服器對圖片同樣直開網址 403),objectURL 餵 <img>,關窗即 revoke。
 */
export function ProtectedImageViewer({ url, name }: { url: string; name: string }) {
  const [src, setSrc] = useState<string | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let objectUrl: string | null = null;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(url, { headers: { 'x-moecish-viewer': '1' } });
        if (!res.ok) throw new Error(String(res.status));
        const blob = await res.blob();
        if (cancelled) return;
        objectUrl = URL.createObjectURL(blob);
        setSrc(objectUrl);
      } catch {
        if (!cancelled) setError(true);
      }
    })();
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [url]);

  if (error) return <p className="py-10 text-center text-body-sm text-white/80">檔案載入失敗，請關閉後重試。</p>;
  if (!src) return <p className="py-10 text-center text-body-sm text-white/80">載入 {name} 中…</p>;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={name}
      draggable={false}
      onDragStart={(e) => e.preventDefault()}
      onContextMenu={(e) => e.preventDefault()}
      className="max-w-full h-auto select-none rounded-sm bg-card"
    />
  );
}
