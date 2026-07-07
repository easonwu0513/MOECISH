import type { Role } from './types';

/**
 * 委員僅見「自己留下的」檢核表意見(批62 裁定):checklist 與 review 頁共用(減法批 dup#7)。
 * 原各頁內聯同一段過濾迴圈 → 收斂為單一具名函式;新增會載入 response.comments 的委員頁時
 * 必須呼叫此函式,漏一頁即洩漏他委員意見(MEMORY 跨批雷區②)。
 * 就地變異(mutate)以貼合既有呼叫端的資料形狀;非委員角色不動(中心看全部、機關由頁面另行處理)。
 */
export function filterOwnComments<C extends { auditorId: string }>(
  responses: { comments: C[] }[],
  role: Role | string,
  userId: string,
): void {
  // 觀察員(批30):委員審閱意見為委員工作紀錄,觀察員一律不可見(批62 各委員獨立審查的
  // 隔離哲學延伸——觀察員練習更不應被任何委員意見影響),整批清空。
  if (role === 'OBSERVER') {
    for (const r of responses) r.comments = [];
    return;
  }
  if (role !== 'AUDITOR') return;
  for (const r of responses) {
    r.comments = r.comments.filter((c) => c.auditorId === userId);
  }
}
