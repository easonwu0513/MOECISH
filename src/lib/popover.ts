/**
 * P2:fixed 定位彈出面板的視窗夾擠(垂直 + 水平)。
 * 自製 popover 以觸發鈕 getBoundingClientRect 定位時,若只寫 `top: rect.bottom` / `left: rect.left`,
 * 表格底部列會被視窗下緣裁切、最右欄會超出右緣(UAT 圖62 只夾了垂直的補完)。
 * panelW/panelH 傳面板的最大尺寸(有 max-h 者傳該值),gap 為與觸發鈕的間距。
 */
export function clampPopoverPos(
  rect: DOMRect,
  panelW: number,
  panelH: number,
  gap = 4,
): { top: number; left: number } {
  const margin = 8;
  const top = Math.max(margin, Math.min(rect.bottom + gap, window.innerHeight - panelH - margin));
  const left = Math.max(margin, Math.min(rect.left, window.innerWidth - panelW - margin));
  return { top, left };
}
