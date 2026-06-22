import { readFile } from 'node:fs/promises';

/**
 * 上傳檔案自動浮水印(防外流 / 可溯源)。
 * 設計:斜向平鋪「短語」(年度+用途+請勿外流,夠短才能完整顯示不被裁成片段)
 *       + 頁尾/底部一行「完整資訊」(機關全名+年度+上傳日期)。
 * 支援 PDF(每頁)、圖片 png/jpeg/webp;Office/zip 無法伺服器端蓋,原樣保存。
 * 中文需內嵌字型(WATERMARK_FONT_PATH 指向 VM 上的 Noto Sans CJK TC OTF)。
 * 字型缺失或失敗一律回原檔,不擋上傳。
 */

const FONT_PATH = process.env.WATERMARK_FONT_PATH ?? '';
const IMAGE_MIMES = new Set(['image/png', 'image/jpeg', 'image/webp']);

let fontCache: Buffer | null | undefined;
let canvasFontRegistered = false;

async function getFont(): Promise<Buffer | null> {
  if (fontCache !== undefined) return fontCache;
  try {
    fontCache = FONT_PATH ? await readFile(FONT_PATH) : null;
  } catch {
    fontCache = null;
  }
  if (!fontCache) {
    console.warn('[watermark] 未設定或讀不到字型(WATERMARK_FONT_PATH),本次不加浮水印');
  }
  return fontCache;
}

export function isWatermarkable(mime: string): boolean {
  return mime === 'application/pdf' || IMAGE_MIMES.has(mime);
}

export type WatermarkText = {
  /** 斜向平鋪的短語,要短(例:115年度資安稽核佐證・請勿外流) */
  tile: string;
  /** 頁尾/底部完整資訊(機關全名+年度+日期) */
  footer: string;
};

/** 對 PDF/圖片加浮水印;不支援類型、無字型或失敗回原 buffer(引用相同代表未處理)。 */
export async function applyWatermark(buf: Buffer, mime: string, wm: WatermarkText): Promise<Buffer> {
  try {
    const font = await getFont();
    if (!font) return buf;
    if (mime === 'application/pdf') return await watermarkPdf(buf, wm, font);
    if (IMAGE_MIMES.has(mime)) return await watermarkImage(buf, mime, wm, font);
  } catch (e) {
    console.error('[watermark] 套用失敗,保留原檔:', (e as Error).message);
  }
  return buf;
}

async function watermarkPdf(buf: Buffer, wm: WatermarkText, font: Buffer): Promise<Buffer> {
  // 關鍵:不在 PDF 內嵌中文字型(pdf-lib 對 CJK CFF/OTF 子集化會壞成方框);
  // 改用 canvas 把浮水印「畫成透明 PNG 疊圖」再蓋到每頁 → CJK 由 canvas 正確渲染。
  const { PDFDocument } = await import('pdf-lib');
  const { createCanvas, GlobalFonts } = await import('@napi-rs/canvas');
  if (!canvasFontRegistered) {
    GlobalFonts.register(font, 'MOECISHWM');
    canvasFontRegistered = true;
  }
  const pdf = await PDFDocument.load(buf, { ignoreEncryption: true });
  const cache = new Map<string, Awaited<ReturnType<typeof pdf.embedPng>>>();

  for (const page of pdf.getPages()) {
    const { width, height } = page.getSize();
    const key = `${Math.round(width)}x${Math.round(height)}`;
    let img = cache.get(key);
    if (!img) {
      const scale = 2; // 以 2x 渲染再縮放,文字清晰
      const cw = Math.max(1, Math.round(width * scale));
      const ch = Math.max(1, Math.round(height * scale));
      const c = createCanvas(cw, ch);
      const ctx = c.getContext('2d');
      // 斜向平鋪短語
      const tileFs = Math.round(16 * scale);
      ctx.font = `${tileFs}px MOECISHWM`;
      ctx.fillStyle = 'rgba(110,110,120,0.30)';
      ctx.textBaseline = 'middle';
      ctx.save();
      ctx.translate(cw / 2, ch / 2);
      ctx.rotate((-30 * Math.PI) / 180);
      const tw = ctx.measureText(wm.tile).width + tileFs * 4;
      const th = tileFs * 5.5;
      const reach = Math.max(cw, ch);
      for (let y = -reach; y < reach; y += th) {
        for (let x = -reach; x < reach; x += tw) ctx.fillText(wm.tile, x, y);
      }
      ctx.restore();
      // 頁尾完整資訊
      const footFs = Math.round(9 * scale);
      ctx.font = `${footFs}px MOECISHWM`;
      ctx.fillStyle = 'rgba(70,70,80,0.7)';
      ctx.textBaseline = 'bottom';
      ctx.fillText(wm.footer, 12 * scale, ch - 10 * scale);
      img = await pdf.embedPng(await c.encode('png'));
      cache.set(key, img);
    }
    page.drawImage(img, { x: 0, y: 0, width, height });
  }
  return Buffer.from(await pdf.save());
}

async function watermarkImage(buf: Buffer, mime: string, wm: WatermarkText, font: Buffer): Promise<Buffer> {
  const { createCanvas, loadImage, GlobalFonts } = await import('@napi-rs/canvas');
  if (!canvasFontRegistered) {
    GlobalFonts.register(font, 'MOECISHWM');
    canvasFontRegistered = true;
  }
  const img = await loadImage(buf);
  const w = img.width;
  const h = img.height;
  const c = createCanvas(w, h);
  const ctx = c.getContext('2d');
  ctx.drawImage(img, 0, 0, w, h);

  // 斜向平鋪短語
  const tileFs = Math.max(16, Math.round(Math.min(w, h) / 22));
  ctx.font = `${tileFs}px MOECISHWM`;
  ctx.fillStyle = 'rgba(95,95,110,0.30)';
  ctx.textBaseline = 'middle';
  ctx.save();
  ctx.translate(w / 2, h / 2);
  ctx.rotate((-30 * Math.PI) / 180);
  const tw = ctx.measureText(wm.tile).width + tileFs * 3;
  const th = tileFs * 4.5;
  const reach = Math.max(w, h);
  for (let y = -reach; y < reach; y += th) {
    for (let x = -reach; x < reach; x += tw) {
      ctx.fillText(wm.tile, x, y);
    }
  }
  ctx.restore();

  // 底部完整資訊(水平、清楚)
  const footFs = Math.max(12, Math.round(Math.min(w, h) / 45));
  ctx.font = `${footFs}px MOECISHWM`;
  ctx.fillStyle = 'rgba(55,55,65,0.72)';
  ctx.textBaseline = 'bottom';
  ctx.fillText(wm.footer, 10, h - 8);

  if (mime === 'image/png') return Buffer.from(await c.encode('png'));
  if (mime === 'image/webp') return Buffer.from(await c.encode('webp', 90));
  return Buffer.from(await c.encode('jpeg', 88));
}
