/**
 * 事前場次調查「意願填報時窗」邏輯(年度制;中心設定,用於「安排好時間、避免安排後又變動」)。
 * 逾窗後受調者不可改/送出意願;中心(SUPER_ADMIN)代填不受限;中心可對個別受調者開放補填(editUnlocked)。
 * 純函式,前後端共用(不觸 DB)。
 */
export type FillWindow = { openAt: Date | null; closeAt: Date | null } | null;

/** 現在是否在填報時窗內。無設定(null)或兩端皆 null=永遠開放(向後相容,無此列時亦視為開放)。 */
export function isFillWindowOpen(win: FillWindow, now: Date): boolean {
  if (!win) return true;
  if (win.openAt && now < win.openAt) return false;
  if (win.closeAt && now > win.closeAt) return false;
  return true;
}

/** 受調者本人此刻能否編修/送出意願:個人被中心開放補填(editUnlocked)或在時窗內。 */
export function canEditAvailability(win: FillWindow, editUnlocked: boolean, now: Date): boolean {
  return editUnlocked || isFillWindowOpen(win, now);
}

/** 時窗狀態(供自助頁顯示鎖定原因)。OPEN=開放;BEFORE=尚未開始;AFTER=已截止。 */
export type FillWindowState = 'OPEN' | 'BEFORE' | 'AFTER';
export function fillWindowState(win: FillWindow, now: Date): FillWindowState {
  if (!win) return 'OPEN';
  if (win.openAt && now < win.openAt) return 'BEFORE';
  if (win.closeAt && now > win.closeAt) return 'AFTER';
  return 'OPEN';
}
