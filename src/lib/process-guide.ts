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

// ════ 週期事實(facts)與角色化「下一步」 ════
// dashboard 與週期內頁共用,避免兩處文案/邏輯分岔。

export type CycleFactsInput = {
  id: string;
  status: string;
  dueDate: Date;
  prepDueDate: Date | null;
  onsiteDate: Date | null;
  deficiencies: { action: { status: string } | null }[];
  prepRequirements: { submission: { status: string } | null }[];
  signedReports: { confirmedAt: Date | null }[];
};

export type CycleFacts = {
  id: string;
  status: CycleStatus;
  dueDate: Date;
  prepDueDate: Date | null;
  onsiteDate: Date | null;
  returned: number;
  submitted: number;
  toFill: number;
  passed: number;
  total: number;
  allPassed: boolean;
  prepTotal: number;
  prepConfirmed: number;
  prepToConfirm: number; // 機關已繳交、待中心確認(SUBMITTED)
  prepDraft: number;     // 待繳交(UPLOADED,機關已處理未送)
  prepInsufficient: number; // 中心退回補正(INSUFFICIENT)
  prepRemaining: number; // 尚未處理(EMPTY / 未建)
  prepAllConfirmed: boolean;
  signedUploaded: boolean;
  signedConfirmed: boolean;
  overdue: boolean;
  step: number;
};

export type NextAction = { text: string; href?: string; cta?: string } | null;

export function fmtMD(d: Date | null | undefined): string | null {
  if (!d) return null;
  const x = new Date(d);
  return `${x.getMonth() + 1}/${x.getDate()}`;
}

export function deriveCycleFacts(c: CycleFactsInput, now: Date = new Date()): CycleFacts {
  const count = (s: string) =>
    c.deficiencies.filter((d) => (d.action?.status ?? 'PENDING') === s).length;
  const returned = count('RETURNED');
  const submitted = count('SUBMITTED');
  const toFill = count('PENDING') + count('DRAFT');
  const passed = count('PASSED');
  const total = c.deficiencies.length;
  const allPassed = total > 0 && passed === total;

  const prepTotal = c.prepRequirements.length;
  const prepStatus = (s: string) =>
    c.prepRequirements.filter((r) => r.submission?.status === s).length;
  const prepConfirmed = prepStatus('CONFIRMED');
  const prepToConfirm = prepStatus('SUBMITTED');       // 機關已繳交,待中心確認
  const prepDraft = prepStatus('UPLOADED');            // 待繳交(已處理未送)
  const prepInsufficient = prepStatus('INSUFFICIENT'); // 中心退回補正
  const prepRemaining = prepTotal - prepConfirmed - prepToConfirm - prepDraft - prepInsufficient; // EMPTY / 未建
  const prepAllConfirmed = prepTotal > 0 && prepConfirmed === prepTotal;

  const signedUploaded = c.signedReports.length > 0;
  const signedConfirmed = c.signedReports.some((r) => r.confirmedAt);
  const status = c.status as CycleStatus;
  const overdue = status === 'REMEDIATION' && !allPassed && new Date(c.dueDate) < now;

  return {
    id: c.id, status, dueDate: c.dueDate, prepDueDate: c.prepDueDate, onsiteDate: c.onsiteDate,
    returned, submitted, toFill, passed, total, allPassed,
    prepTotal, prepConfirmed, prepToConfirm, prepDraft, prepInsufficient, prepRemaining, prepAllConfirmed,
    signedUploaded, signedConfirmed, overdue,
    step: cycleStepIndex(status, allPassed),
  };
}

/** 依角色與週期事實,給出「你現在該做什麼」(帶入口連結)。 */
export function nextActionForRole(role: Role, f: CycleFacts): NextAction {
  const base = `/cycles/${f.id}`;
  const due = fmtMD(f.dueDate);
  const prepDue = fmtMD(f.prepDueDate);
  const onsite = fmtMD(f.onsiteDate);
  const st = f.status;

  if (st === 'CLOSED') return null;

  if (role === 'SUPER_ADMIN') {
    if (st === 'DRAFT') return { text: '設定資料準備清單、指派委員後開始準備', href: base, cta: '去設定' };
    if (st === 'PREPARATION') {
      if (f.prepAllConfirmed) return { text: '資料全數確認齊備,可安排實地稽核', href: base, cta: '去安排' };
      if (f.prepToConfirm > 0) return { text: `機關已繳交,待審核確認 ${f.prepToConfirm} 項`, href: `${base}/prep`, cta: '去審核' };
      return { text: `資料準備中:已確認 ${f.prepConfirmed}/${f.prepTotal}${prepDue ? `(截止 ${prepDue})` : ''}`, href: `${base}/prep`, cta: '查看' };
    }
    if (st === 'READY') return { text: `安排實地稽核${onsite ? `(${onsite})` : ''}`, href: base, cta: '查看' };
    if (st === 'ONSITE') return { text: '稽核結束後發布缺失(表單或 Excel 匯入)', href: `${base}/deficiencies`, cta: '去發布' };
    if (st === 'REPORT_ISSUED') return { text: '確認缺失內容,通知機關開始矯正', href: base, cta: '去通知' };
    // REMEDIATION
    if (!f.allPassed) return { text: `追蹤填報:待填 ${f.toFill}・審查中 ${f.submitted}・退回 ${f.returned}${f.overdue ? '・已逾期' : ''}`, href: `${base}/deficiencies`, cta: '查看' };
    if (!f.signedUploaded) return { text: '全數通過,等機關上傳用印報告(可寄提醒)', href: '/admin/emails', cta: '寄提醒' };
    if (!f.signedConfirmed) return { text: '用印報告已上傳,確認後正式結案', href: base, cta: '去結案' };
    return { text: '結案處理中', href: base, cta: '查看' };
  }

  if (role === 'ORG_ADMIN') {
    if (st === 'DRAFT') return { text: '中心開立中,暫無需處理' };
    if (st === 'PREPARATION') {
      if (f.prepInsufficient > 0) return { text: `${f.prepInsufficient} 項資料被退回,請補正後重新繳交`, href: `${base}/prep`, cta: '去補正' };
      if (f.prepRemaining > 0) return { text: `上傳或敘明稽核前資料(還有 ${f.prepRemaining}/${f.prepTotal} 項)${prepDue ? `,截止 ${prepDue}` : ''}`, href: `${base}/prep`, cta: '去處理' };
      if (f.prepDraft > 0) return { text: '資料已齊,請按「確定繳交」送交中心審核', href: `${base}/prep`, cta: '去繳交' };
      if (f.prepAllConfirmed) return { text: '資料已全數確認齊備,等待中心安排實地稽核', href: `${base}/prep`, cta: '查看' };
      return { text: '資料已繳交,等待中心確認', href: `${base}/prep`, cta: '查看' };
    }
    if (st === 'READY') return { text: `資料齊備,等待實地稽核${onsite ? `(${onsite})` : ''}` };
    if (st === 'ONSITE') return { text: '實地稽核進行中,配合委員查核' };
    if (st === 'REPORT_ISSUED') return { text: '缺失發布中,可先檢視內容', href: `${base}/deficiencies`, cta: '去檢視' };
    // REMEDIATION
    if (f.returned > 0) return { text: `優先補正 ${f.returned} 項被退回的矯正措施`, href: `${base}/deficiencies?status=returned`, cta: '去補正' };
    if (f.toFill > 0) return { text: `填報 ${f.toFill} 項矯正措施${due ? `(截止 ${due})` : ''}`, href: `${base}/deficiencies?status=todo`, cta: '去填報' };
    if (!f.allPassed) return { text: `${f.submitted} 項審查中,等待委員結果`, href: `${base}/deficiencies?status=submitted`, cta: '查看' };
    if (!f.signedUploaded) return { text: '全數通過!列印改善報告,用印後上傳', href: `${base}#signed-report`, cta: '去上傳' };
    if (!f.signedConfirmed) return { text: '用印報告已上傳,等待中心確認結案' };
    return { text: '結案處理中' };
  }

  // AUDITOR
  if (st === 'DRAFT') return { text: '週期開立中' };
  if (st === 'PREPARATION') return { text: '資料準備中(由中心審核齊備),待實地稽核', href: `${base}/prep`, cta: '查看' };
  if (st === 'READY') return { text: `資料齊備,待實地稽核${onsite ? `(${onsite})` : ''}` };
  if (st === 'ONSITE') return { text: '依排定日期到場查核' };
  if (st === 'REPORT_ISSUED') return { text: '中心發布缺失中' };
  // REMEDIATION
  if (f.submitted > 0) return { text: `審查 ${f.submitted} 項已送審的矯正措施`, href: `${base}/deficiencies?status=submitted`, cta: '去審查' };
  if (!f.allPassed) return { text: '等機關送審矯正措施' };
  return { text: '已全數通過,結案處理中' };
}

/** 各角色在四個步驟分別要做的事(後台流程指引文案)。 */
export const ROLE_STEP_DUTIES: Record<Role, [string, string, string, string]> = {
  SUPER_ADMIN: [
    '開立稽核週期、設定截止日並指派委員;機關確定繳交後,逐項確認資料齊備或退回補正。',
    '實地稽核當日留存查核紀錄;結束後彙整缺失內容。',
    '以表單或 Excel 發布稽核缺失;追蹤各機關填報進度、寄送追蹤信。',
    '委員全數審查通過後,確認機關用印報告並正式結案。',
  ],
  ORG_ADMIN: [
    '於截止日前上傳檢核表與佐證(或敘明無相關文件理由),完成後按「確定繳交」送交中心;被退回時儘速補正重交。',
    '配合委員到場查核,協助提供現場資料。',
    '逐項填報根因分析與改善措施、上傳佐證後送審;退回項目補正重送。',
    '全數通過後列印改善報告,完成用印並上傳回傳中心。',
  ],
  AUDITOR: [
    '資料準備由中心審核齊備;此階段可先熟悉受稽機關背景資料。',
    '依排定日期到場實地查核。',
    '機關送審後逐項審查矯正措施,必要時退回補正(可多輪)。',
    '全數通過後,配合中心完成結案確認。',
  ],
};
