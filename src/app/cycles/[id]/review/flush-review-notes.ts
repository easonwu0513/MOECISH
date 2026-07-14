/**
 * 委員審閱頁「統一儲存」的全域 flush 契約(批68 Q2)。
 *
 * 逐題筆記/意見編輯元件(CommentForm / ReviewNote / ObserverCommentSection)在掛載時
 * 監聽 FLUSH_REVIEW_NOTES_EVENT;收到事件時,若自身有「正在輸入、尚未存檔」的 dirty 草稿,
 * 立即靜默送出,並透過 detail.collect() 回報其存檔 Promise。統一「儲存」鈕
 * (SaveAllReviewNotes)dispatch 此事件後,等待所有回報的 Promise 完成再彙整 toast。
 *
 * 注意:此機制只 flush「筆記類草稿」;不代送任何顯式提交流程外的欄位。
 */
export const FLUSH_REVIEW_NOTES_EVENT = 'moecish:flush-review-notes';

export type FlushReviewNotesDetail = {
  /** 由筆記元件呼叫,交回一個「存檔完成才 resolve、失敗則 reject」的 Promise。 */
  collect: (p: Promise<void>) => void;
};

/**
 * 筆記編輯元件用的小工具:在 mount 期間監聽 flush 事件。
 * getPending 回傳「若有 dirty 草稿則其存檔 Promise,否則 null」——回傳 null 表示無事可做(跳過)。
 */
export function onFlushReviewNotes(getPending: () => Promise<void> | null): () => void {
  const handler = (e: Event) => {
    const detail = (e as CustomEvent<FlushReviewNotesDetail>).detail;
    if (!detail || typeof detail.collect !== 'function') return;
    const p = getPending();
    if (p) detail.collect(p);
  };
  window.addEventListener(FLUSH_REVIEW_NOTES_EVENT, handler);
  return () => window.removeEventListener(FLUSH_REVIEW_NOTES_EVENT, handler);
}
