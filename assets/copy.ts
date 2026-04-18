// 集中管理系統輔助文案（歡迎語、空狀態、toast 訊息）。
// 專業稽核術語（稽核、檢核項目、稽核發現…）不在這裡改，避免影響公文對照。

export const GREETINGS = {
  morning: '早安',
  noon: '午安',
  afternoon: '午安',
  evening: '晚上好',
};

export function greetingByHour(hour: number): string {
  if (hour < 5) return GREETINGS.evening;
  if (hour < 11) return GREETINGS.morning;
  if (hour < 14) return GREETINGS.noon;
  if (hour < 18) return GREETINGS.afternoon;
  return GREETINGS.evening;
}

export const EMPTY = {
  noCycles: {
    title: '目前還沒有稽核週期',
    description: '等平台管理員開立稽核週期後，這裡就會顯示您的待辦。',
  },
  noFindings: {
    title: '尚未開立稽核發現',
    description: '實地稽核後由稽核委員於此開立；目前沒有需要處理的項目。',
  },
  noTodos: {
    title: '目前沒有待辦事項',
    description: '辛苦了，好好休息吧。',
  },
  noResults: {
    title: '沒有符合的結果',
    description: '試試調整搜尋字或清除篩選條件。',
  },
};

export const TOAST = {
  savedChecklist: (no: string) => ({ title: '已儲存', description: `第 ${no} 題更新完成，軌跡留存中。` }),
  savedRemediation: () => ({ title: '已儲存', description: '改善內容草稿已更新。' }),
  submittedRemediation: () => ({ title: '已送出審核', description: '稽核委員會收到通知。' }),
  approvedRemediation: () => ({ title: '已通過', description: '改善項目審核通過。' }),
  needsReworkRemediation: () => ({ title: '已回覆持續改正', description: '受稽機關將進行下一輪補正。' }),
  transitioned: (toLabel: string) => ({ title: '狀態已更新', description: `目前：${toLabel}` }),
  error: (msg: string) => ({ title: '操作失敗', description: msg }),
  networkError: () => ({ title: '連線異常', description: '請檢查網路或稍後再試。' }),
};
