import { readFile } from 'node:fs/promises';

/**
 * 上傳檔案自動浮水印(防外流 / 可溯源)。
 * 支援:PDF(每頁斜向平鋪)、圖片 png/jpeg/webp。
 * Office(Word/Excel/PPT/ODF)與 zip 無法在伺服器端蓋,原樣保存。
 * 中文需內嵌字型;字型路徑由 WATERMARK_FONT_PATH 指定(VM 上的 Noto Sans CJK TC OTF)。
 * 字型缺失或套用失敗時,一律回傳原始 buffer(不擋上傳)。
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

/** 對 PDF/圖片加浮水印;不支援的類型、無字型或失敗時回傳原 buffer(以引用相同代表未處理)。 */
export async function applyWatermark(buf: Buffer, mime: string, text: string): Promise<Buffer> {
  try {
    const font = await getFont();
    if (!font) return buf;
    if (mime === 'application/pdf') return await watermarkPdf(buf, text, font);
    if (IMAGE_MIMES.has(mime)) return await watermarkImage(buf, mime, text, font);
  } catch (e) {
    console.error('[watermark] 套用失敗,保留原檔:', (e as Error).message);
  }
  return buf;
}

async function watermarkPdf(buf: Buffer, text: string, font: Buffer): Promise<Buffer> {
  const { PDFDocument, degrees, rgb } = await import('pdf-lib');
  const fontkit = (await import('@pdf-lib/fontkit')).default;
  const pdf = await PDFDocument.load(buf, { ignoreEncryption: true });
  pdf.registerFontkit(fontkit);
  const f = await pdf.embedFont(font, { subset: true });
  const size = 13;
  const stepX = 300;
  const stepY = 150;
  for (const page of pdf.getPages()) {
    const { width, height } = page.getSize();
    for (let y = -60; y < height + stepY; y += stepY) {
      for (let x = -60; x < width + stepX; x += stepX) {
        page.drawText(text, {
          x, y, size, font: f,
          color: rgb(0.55, 0.55, 0.6),
          opacity: 0.16,
          rotate: degrees(30),
        });
      }
    }
  }
  return Buffer.from(await pdf.save());
}

async function watermarkImage(buf: Buffer, mime: string, text: string, font: Buffer): Promise<Buffer> {
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

  const fontSize = Math.max(14, Math.round(Math.min(w, h) / 28));
  ctx.font = `${fontSize}px MOECISHWM`;
  ctx.fillStyle = 'rgba(110,110,120,0.22)';
  ctx.textBaseline = 'middle';
  ctx.save();
  ctx.translate(w / 2, h / 2);
  ctx.rotate((-30 * Math.PI) / 180);
  const tileW = ctx.measureText(text).width + fontSize * 4;
  const tileH = fontSize * 6;
  const reach = Math.max(w, h);
  for (let y = -reach; y < reach; y += tileH) {
    for (let x = -reach; x < reach; x += tileW) {
      ctx.fillText(text, x, y);
    }
  }
  ctx.restore();

  if (mime === 'image/png') return Buffer.from(await c.encode('png'));
  if (mime === 'image/webp') return Buffer.from(await c.encode('webp', 90));
  return Buffer.from(await c.encode('jpeg', 88));
}
