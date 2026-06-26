import type { CycleStatus } from './types';

/**
 * 週期「前進(forward)轉換」時的通知政策 —— 單一事實來源(SoT)。
 *
 * 回傳「進入某狀態」時應通知哪些角色:
 *  - org:       通知機關管理員(notifyCycleStatusChange)
 *  - committee: 通知受指派委員開始審閱(notifyCommitteeReview)
 *
 * 真值表測試 `src/scripts/test-notify-matrix.ts`(npm run test:notify)鎖定本表;改錯即紅。
 * 新增/調整通知時機 → 改這裡 + 對應期望,別在各 route/通知函式內聯判斷。
 *
 * 規則出處(見 docs/REVIEW-HEURISTICS.md「A. 通知」):
 *  - A1 某階段該角色於系統內無可操作項目 → 不寄信。
 *       ONSITE(實地稽核中):機關無可操作項目、稽核日已於開立通知告知;委員資料齊備時已收審閱通知 → 皆 false。
 *  - A2 通知對象要對:資料齊備(READY)才通知委員開始審閱(委員在此之前看不到機關資料)。
 */
export type CycleNotifyPolicy = { org: boolean; committee: boolean };

const CYCLE_TRANSITION_NOTIFY: Record<CycleStatus, CycleNotifyPolicy> = {
  DRAFT: { org: false, committee: false }, // 不會 forward 進 DRAFT(建立即為 DRAFT)
  PREPARATION: { org: true, committee: false }, // 機關:依清單上傳稽核前資料
  READY: { org: true, committee: true }, // 機關:已齊備待實地稽核;委員:可開始審閱
  ONSITE: { org: false, committee: false }, // 雙方此階段於系統內無可操作項目
  REPORT_ISSUED: { org: true, committee: false }, // 機關:稽核報告已產出
  REMEDIATION: { org: true, committee: false }, // 機關:填報矯正措施與佐證
  CLOSED: { org: true, committee: false }, // 機關:已結案
};

/** 進入 toStatus(forward 轉換)時應通知的對象。 */
export function cycleTransitionNotify(toStatus: CycleStatus): CycleNotifyPolicy {
  return CYCLE_TRANSITION_NOTIFY[toStatus] ?? { org: false, committee: false };
}
