/**
 * 對內日期格式統一(民國年)。系統內畫面與「N 年度」一致採民國年;
 * print/report 既有自有格式不走這裡,audit-merge 隔離區不碰。
 */

/** 民國年日期:115年6月11日 */
export function fmtROC(d: Date | string | null | undefined): string {
  if (!d) return '';
  const dt = new Date(d);
  if (Number.isNaN(dt.getTime())) return '';
  return `${dt.getFullYear() - 1911}年${dt.getMonth() + 1}月${dt.getDate()}日`;
}

/** 民國年日期 + 24 小時制時間:115年6月11日 14:30 */
export function fmtROCDateTime(d: Date | string | null | undefined): string {
  if (!d) return '';
  const dt = new Date(d);
  if (Number.isNaN(dt.getTime())) return '';
  const hh = String(dt.getHours()).padStart(2, '0');
  const mm = String(dt.getMinutes()).padStart(2, '0');
  return `${fmtROC(dt)} ${hh}:${mm}`;
}
