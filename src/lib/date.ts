/**
 * 對內日期格式統一(民國年)。系統內畫面與「N 年度」一致採民國年;
 * print/report 既有自有格式不走這裡,audit-merge 隔離區不碰。
 *
 * 一律以「台北時區(Asia/Taipei)」呈現:伺服器端渲染(server component)若主機為 UTC,
 * 直接用 getHours() 會少 8 小時(最後登入時間曾因此顯示錯誤),故強制指定時區。
 */

const TZ = 'Asia/Taipei';

type Parts = { y: number; mo: number; d: number; hh: string; mm: string; ss: string };

function tpeParts(d: Date | string | null | undefined): Parts | null {
  if (!d) return null;
  const dt = new Date(d);
  if (Number.isNaN(dt.getTime())) return null;
  const f = new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  });
  const o: Record<string, string> = {};
  for (const p of f.formatToParts(dt)) if (p.type !== 'literal') o[p.type] = p.value;
  return { y: +o.year, mo: +o.month, d: +o.day, hh: o.hour, mm: o.minute, ss: o.second };
}

/** 民國年日期:115年6月11日 */
export function fmtROC(d: Date | string | null | undefined): string {
  const p = tpeParts(d);
  return p ? `${p.y - 1911}年${p.mo}月${p.d}日` : '';
}

/** 西元年(數字) → 民國年(數字) */
export function rocYear(gregorianYear: number): number {
  return gregorianYear - 1911;
}

/** 民國年點分隔日期:115.06.11(正式報告 / Excel 匯出用) */
export function rocDateDotted(d: Date | string | null | undefined): string {
  const p = tpeParts(d);
  return p ? `${p.y - 1911}.${String(p.mo).padStart(2, '0')}.${String(p.d).padStart(2, '0')}` : '';
}

/** 民國年日期 + 24 小時制時間:115年6月11日 14:30 */
export function fmtROCDateTime(d: Date | string | null | undefined): string {
  const p = tpeParts(d);
  return p ? `${p.y - 1911}年${p.mo}月${p.d}日 ${p.hh}:${p.mm}` : '';
}

/** 民國年 + 時:分:秒:115年6月11日 14:30:05(稽核軌跡等需秒級鑑識精度處) */
export function fmtROCDateTimeSec(d: Date | string | null | undefined): string {
  const p = tpeParts(d);
  return p ? `${p.y - 1911}年${p.mo}月${p.d}日 ${p.hh}:${p.mm}:${p.ss}` : '';
}
