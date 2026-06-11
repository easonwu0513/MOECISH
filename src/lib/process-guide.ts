import type { CycleStatus, Role } from './types';

/**
 * 稽核管考四步驟 — 與前台首頁「稽核管考流程」一致,
 * 後台用它把週期狀態對映到流程位置,並依角色顯示各階段工作。
 */
export const PROCESS_STEPS = [
  { no: 1, title: '資料準備' },
  { no: 2, title: '實地稽核' },
  { no: 3, title: '缺失矯正' },
  { no: 4, title: '審查結案' },
] as const;

/**
 * 週期狀態 → 流程步驟位置。
 * 0 = 籌備中(尚未進入流程);1–4 = 對應步驟進行中;5 = 全部完成(結案)。
 * REMEDIATION 且全數通過時視為已走到「審查結案」(用印與結案確認階段)。
 */
export function cycleStepIndex(status: CycleStatus, allPassed: boolean): number {
  switch (status) {
    case 'DRAFT':         return 0;
    case 'PREPARATION':   return 1;
    case 'READY':         return 1;
    case 'ONSITE':        return 2;
    case 'REPORT_ISSUED': return 3;
    case 'REMEDIATION':   return allPassed ? 4 : 3;
    case 'CLOSED':        return 5;
  }
}

/** 各角色在四個步驟分別要做的事(後台流程指引文案)。 */
export const ROLE_STEP_DUTIES: Record<Role, [string, string, string, string]> = {
  SUPER_ADMIN: [
    '開立稽核週期、設定截止日並指派委員,通知機關開始上傳資料。',
    '實地稽核當日留存查核紀錄;結束後彙整缺失內容。',
    '以表單或 Excel 發布稽核缺失;追蹤各機關填報進度、寄送追蹤信。',
    '委員全數審查通過後,確認機關用印報告並正式結案。',
  ],
  ORG_ADMIN: [
    '於截止日前上傳檢核表與佐證文件;委員標記缺件時儘速補上。',
    '配合委員到場查核,協助提供現場資料。',
    '逐項填報根因分析與改善措施、上傳佐證後送審;退回項目補正重送。',
    '全數通過後列印改善報告,完成用印並上傳回傳中心。',
  ],
  AUDITOR: [
    '線上逐份確認資料齊備;不足之處標記請機關補正。',
    '依排定日期到場實地查核。',
    '機關送審後逐項審查矯正措施,必要時退回補正(可多輪)。',
    '全數通過後,配合中心完成結案確認。',
  ],
};
