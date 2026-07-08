import { auditorReviewWindowState, type CycleStatus, type Role } from './types';

// 流程四步驟與「狀態→步驟」對映已收斂至單一真實來源 lib/stage.ts;
// 此處 re-export 維持既有匯入路徑(CycleStepper/首頁/儀表板),deriveCycleFacts 內部亦由其派生。
import { cycleStepIndex } from './stage';
export { PROCESS_STEPS, cycleStepIndex } from './stage';

// ════ 週期事實(facts)與角色化「下一步」 ════
// dashboard 與週期內頁共用,避免兩處文案/邏輯分岔。

export type CycleFactsInput = {
  id: string;
  status: string;
  dueDate: Date | null;
  prepDueDate: Date | null;
  prepDueTech: Date | null;
  onsiteDate: Date | null;
  deficiencies: { action: { status: string } | null; reviewerAuditorId?: string | null }[];
  prepRequirements: { category: string; submission: { status: string } | null }[];
  signedReports: { confirmedAt: Date | null }[];
  // 檢核表(87 題自評)— 選填;傳入才會納入「下一步」導引(救出原本隱形的填報死路)
  checklistSubmittedAt?: Date | null;
  checklistVersion?: { _count?: { items: number } | null } | null;
  responses?: { compliance: string | null; comments?: { id: string }[] }[];
  // 委員審閱窗口(選填):傳入才會讓「委員審閱」下一步在窗口關閉時降為告知(不導向鎖定頁)
  reviewWindowStart?: Date | null;
  reviewWindowEnd?: Date | null;
};

export type CycleFacts = {
  id: string;
  status: CycleStatus;
  dueDate: Date | null;
  prepDueDate: Date | null;
  prepDueTech: Date | null;
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
  // 機關區(技術檢測 / 實地稽核,非中心匯入)整體進度 — 精靈「全部完成」判定用(非「任一」)
  mechAllAddressed: boolean;  // 全部已上傳/敘明理由(非 EMPTY)
  mechAllSubmitted: boolean;  // 全部已確定繳交(SUBMITTED 或 CONFIRMED)
  mechTechAllSubmitted: boolean;   // 技術檢測類全部已繳交(無此類項目視為完成)
  mechOnsiteAllSubmitted: boolean; // 實地稽核類全部已繳交(無此類項目視為完成)
  mechAllConfirmed: boolean;  // 全部經中心確認齊備(CONFIRMED)
  // 機關區逐狀態計數 — 機關的儀表板/標頭只算自己的項目(扣除中心匯入)
  mechTotal: number;
  mechConfirmed: number;
  mechInsufficient: number;
  mechDraft: number;
  mechRemaining: number;
  signedUploaded: boolean;
  signedConfirmed: boolean;
  overdue: boolean;
  step: number;
  // 檢核表
  checklistTotal: number;
  checklistAnswered: number;
  checklistSubmitted: boolean;
  checklistOpenComments: number;
  // 委員審閱窗口是否開啟(收斂驗證修:委員 ONSITE「去檢視」下一步須與 buildModuleNav 的審閱卡鎖定同基準)
  reviewWindowOpen: boolean;
};

export type NextAction = { text: string; href?: string; cta?: string } | null;

export function fmtMD(d: Date | null | undefined): string | null {
  if (!d) return null;
  const x = new Date(d);
  return `${x.getMonth() + 1}/${x.getDate()}`;
}

export function deriveCycleFacts(c: CycleFactsInput, now: Date = new Date(), viewerAuditorId?: string): CycleFacts {
  // 委員視角(傳 viewerAuditorId):所有缺失衍生事實(待審/待填/退回/通過/總數/全通過)只計「指派給本人審閱」者
  // (reviewer-aware);其餘角色(不傳)計全部,語意不變。UAT 批66:委員的儀表板 CTA/週期頁橫幅/建議下一步
  // 皆須與缺失卡/構面進度同基準(只看自己審閱的缺失),否則會出現「自己 2/2 全通過」卻「等機關送審」的矛盾。
  const defs = viewerAuditorId
    ? c.deficiencies.filter((d) => d.reviewerAuditorId === viewerAuditorId)
    : c.deficiencies;
  const count = (s: string) => defs.filter((d) => (d.action?.status ?? 'PENDING') === s).length;
  const returned = count('RETURNED');
  const submitted = count('SUBMITTED');
  const toFill = count('PENDING') + count('DRAFT');
  const passed = count('PASSED');
  const total = defs.length;
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
  // 機關區(非 CENTER)逐階段「全部完成」判定:精靈「上傳/繳交/確認」項不應只看「任一項」
  const mechStatuses = c.prepRequirements
    .filter((r) => r.category !== 'CENTER')
    .map((r) => r.submission?.status ?? 'EMPTY');
  const mechAllAddressed = mechStatuses.length > 0 && mechStatuses.every((s) => s !== 'EMPTY');
  const mechAllSubmitted = mechStatuses.length > 0 && mechStatuses.every((s) => s === 'SUBMITTED' || s === 'CONFIRMED');
  const mechAllConfirmed = mechStatuses.length > 0 && mechStatuses.every((s) => s === 'CONFIRMED');
  const mechTotal = mechStatuses.length;
  const mechConfirmed = mechStatuses.filter((s) => s === 'CONFIRMED').length;
  const mechInsufficient = mechStatuses.filter((s) => s === 'INSUFFICIENT').length;
  const mechDraft = mechStatuses.filter((s) => s === 'UPLOADED').length;
  const mechRemaining = mechStatuses.filter((s) => s === 'EMPTY').length;
  // 分類「全部繳交」判定(技術檢測/實地稽核可分次繳交,精靈拆成兩項):該類無項目視為完成(不擋)
  const catAllSubmitted = (cat: string) => {
    const sts = c.prepRequirements.filter((r) => r.category === cat).map((r) => r.submission?.status ?? 'EMPTY');
    return sts.length === 0 || sts.every((s) => s === 'SUBMITTED' || s === 'CONFIRMED');
  };
  const mechTechAllSubmitted = catAllSubmitted('TECH');
  const mechOnsiteAllSubmitted = catAllSubmitted('ONSITE');

  const signedUploaded = c.signedReports.length > 0;
  const signedConfirmed = c.signedReports.some((r) => r.confirmedAt);
  const status = c.status as CycleStatus;
  const overdue = status === 'REMEDIATION' && !allPassed && !!c.dueDate && new Date(c.dueDate) < now;

  const checklistTotal = c.checklistVersion?._count?.items ?? 0;
  const checklistAnswered = (c.responses ?? []).filter((r) => r.compliance != null).length;
  const checklistSubmitted = !!c.checklistSubmittedAt;
  const checklistOpenComments = (c.responses ?? []).filter((r) => (r.comments?.length ?? 0) > 0).length;
  // 審閱窗口未帶(未 include 兩欄)時視為 open,維持既有行為;帶了才據以降級委員「去檢視」下一步
  const reviewWindowOpen =
    c.reviewWindowStart === undefined && c.reviewWindowEnd === undefined
      ? true
      : auditorReviewWindowState(c.reviewWindowStart ?? null, c.reviewWindowEnd ?? null) === 'open';

  return {
    id: c.id, status, dueDate: c.dueDate, prepDueDate: c.prepDueDate, prepDueTech: c.prepDueTech, onsiteDate: c.onsiteDate,
    returned, submitted, toFill, passed, total, allPassed,
    prepTotal, prepConfirmed, prepToConfirm, prepDraft, prepInsufficient, prepRemaining, prepAllConfirmed,
    mechAllAddressed, mechAllSubmitted, mechAllConfirmed,
    mechTechAllSubmitted, mechOnsiteAllSubmitted,
    mechTotal, mechConfirmed, mechInsufficient, mechDraft, mechRemaining,
    signedUploaded, signedConfirmed, overdue,
    step: cycleStepIndex(status, allPassed),
    checklistTotal, checklistAnswered, checklistSubmitted, checklistOpenComments,
    reviewWindowOpen,
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
    if (st === 'DRAFT') return { text: '設定資料準備清單、指派委員後開始準備', href: `${base}/settings#assign-auditors`, cta: '去設定' };
    if (st === 'PREPARATION') {
      if (f.prepAllConfirmed) return { text: '資料全數確認齊備,可安排實地稽核', href: base, cta: '去安排' };
      if (f.prepToConfirm > 0) return { text: `機關已繳交,待審核確認 ${f.prepToConfirm} 項`, href: `${base}/prep`, cta: '去審核' };
      return { text: `資料準備中:已確認 ${f.prepConfirmed}/${f.prepTotal}${prepDue ? `(截止 ${prepDue})` : ''}`, href: `${base}/prep`, cta: '查看' };
    }
    if (st === 'READY') return { text: `安排實地稽核${onsite ? `(${onsite})` : ''}`, href: base, cta: '去安排' };
    if (st === 'ONSITE') return { text: '稽核結束後至彙整報告完成年度稽核(一鍵轉缺失並通知機關)', href: `${base}/audit/report`, cta: '去彙整' };
    if (st === 'REPORT_ISSUED') return { text: '確認缺失內容,通知機關開始矯正', href: base, cta: '去通知' };
    // REMEDIATION
    if (!f.allPassed) return { text: `追蹤填報:待填 ${f.toFill}・審查中 ${f.submitted}・退回 ${f.returned}${f.overdue ? '・已逾期' : ''}`, href: `${base}/deficiencies`, cta: '去追蹤' };
    if (!f.signedUploaded) return { text: '全數通過,等機關上傳用印報告(可寄提醒)', href: '/admin/emails', cta: '寄提醒' };
    if (!f.signedConfirmed) return { text: '用印報告已上傳,確認後正式結案', href: base, cta: '去結案' };
    return { text: '結案處理中', href: base, cta: '查看' };
  }

  if (role === 'ORG_ADMIN') {
    if (st === 'DRAFT') return { text: '中心開立中,暫無需處理' };
    if (st === 'PREPARATION') {
      // 機關只看自己負責的機關區(技術檢測/實地稽核),扣除中心匯入區;截止日分技術檢測與實地稽核兩條列出
      const techDue = fmtMD(f.prepDueTech);
      const dueText = [techDue && `技術檢測文件繳交截止日 ${techDue}`, prepDue && `實地稽核文件繳交截止日 ${prepDue}`].filter(Boolean).join('・');
      if (f.mechInsufficient > 0) return { text: `${f.mechInsufficient} 項資料被退回,請補正後重新繳交`, href: `${base}/prep`, cta: '去補正' };
      // 87 題自評檢核表是機關最花時間的任務,先前完全不在「下一步」導引中(隱形死路)→ 未送出時明確帶出;
      // 並一併帶出尚未處理的稽核前資料(機關區),讓機關一眼看到兩項平行任務(檢核表 + 應上傳資料)。
      if (f.checklistTotal > 0 && !f.checklistSubmitted) {
        const parts = [`填報資安檢核表(${f.checklistAnswered}/${f.checklistTotal} 題)`];
        if (f.mechRemaining > 0) parts.push(`上傳稽核前資料(尚有 ${f.mechRemaining} 項)`);
        return { text: parts.join('、'), href: `${base}/checklist`, cta: '去填報' };
      }
      if (f.mechRemaining > 0) return { text: `上傳或敘明稽核前資料(還有 ${f.mechRemaining} 項)${dueText ? `,${dueText}` : ''}`, href: `${base}/prep`, cta: '去處理' };
      if (f.mechDraft > 0) return { text: '資料已齊,請按「確定繳交」送交中心審核', href: `${base}/prep`, cta: '去繳交' };
      if (f.mechAllConfirmed) return { text: '資料已全數確認齊備,等待中心安排實地稽核', href: `${base}/prep`, cta: '查看' };
      return { text: '資料已繳交,等待中心確認', href: `${base}/prep`, cta: '查看' };
    }
    if (st === 'READY') return { text: `資料齊備,等待實地稽核${onsite ? `(${onsite})` : ''}` };
    if (st === 'ONSITE') return { text: '實地稽核進行中,配合委員查核' };
    if (st === 'REPORT_ISSUED') return { text: '缺失發布中,待中心通知後即可填報矯正措施' };
    // REMEDIATION
    if (f.returned > 0) return { text: `優先補正 ${f.returned} 項被退回的矯正措施`, href: `${base}/deficiencies?status=returned`, cta: '去補正' };
    if (f.toFill > 0) return { text: `填報 ${f.toFill} 項矯正措施${due ? `(截止 ${due})` : ''}`, href: `${base}/deficiencies?status=todo`, cta: '去填報' };
    if (!f.allPassed) return { text: `${f.submitted} 項審查中,等待委員結果`, href: `${base}/deficiencies?status=submitted`, cta: '查看' };
    if (!f.signedUploaded) return { text: '全數通過!列印改善報告,用印後上傳', href: `${base}#signed-report`, cta: '去上傳' };
    if (!f.signedConfirmed) return { text: '用印報告已上傳,等待中心確認結案' };
    return { text: '結案處理中' };
  }

  // OBSERVER(批30 師徒制):觀摩學習動線——檢視資料/撰寫練習/回顧回饋;不涉評分與缺失管考
  if (role === 'OBSERVER') {
    if (st === 'DRAFT') return { text: '週期開立中' };
    if (st === 'PREPARATION') return { text: '資料準備中;待週期進入資料齊備階段後,可於觀察員審閱時段內檢視資料' };
    if (st === 'READY') return { text: `資料齊備;請於觀察員審閱時段內檢視機關資料,熟悉受稽機關背景${onsite ? `(實地稽核 ${onsite})` : ''}`, href: `${base}/review`, cta: '去檢視' };
    if (st === 'ONSITE') return { text: '隨同觀摩實地稽核;於「稽核發現撰寫練習」撰寫您的練習發現', href: `${base}/practice`, cta: '去練習' };
    // REPORT_ISSUED / REMEDIATION:缺失管考不對觀察員開放,僅回顧練習
    return { text: '可回顧您的撰寫練習與指導委員回饋', href: `${base}/practice`, cta: '查看' };
  }

  // AUDITOR
  if (st === 'DRAFT') return { text: '週期開立中' };
  if (st === 'PREPARATION') return { text: '資料準備中(中心審核齊備中);待週期進入資料齊備階段後可檢視資料' };
  if (st === 'READY') return { text: `資料齊備,待實地稽核${onsite ? `(${onsite})` : ''}` };
  if (st === 'ONSITE') {
    // 審閱窗口關閉/未設時不導向 /review(=鎖定頁死路,收斂驗證修);降為告知,對齊 buildModuleNav 審閱卡鎖定
    if (f.checklistSubmitted && f.reviewWindowOpen) {
      return {
        text: f.checklistOpenComments > 0
          ? `到場查核;檢核表已留 ${f.checklistOpenComments} 題意見(可續審)`
          : '到場查核;可逐題檢視機關自評檢核表、留審閱註記',
        href: `${base}/review`,
        cta: '去檢視',
      };
    }
    if (f.checklistSubmitted) return { text: '到場查核;待中心設定委員審閱時段後可逐題檢視機關自評' };
    return { text: '依排定日期到場查核' };
  }
  if (st === 'REPORT_ISSUED') return { text: '中心發布缺失中' };
  // REMEDIATION
  if (f.submitted > 0) return { text: `審查 ${f.submitted} 項已送審的矯正措施`, href: `${base}/deficiencies?status=submitted`, cta: '去審查' };
  if (!f.allPassed) return { text: '等機關送審矯正措施' };
  return { text: '已全數通過,結案處理中' };
}

/** 各角色在四個步驟分別要做的事(後台流程指引文案)。 */
export const ROLE_STEP_DUTIES: Record<Role, [string, string, string, string]> = {
  SUPER_ADMIN: [
    '開立稽核週期、設定截止日並指派委員;機關確定繳交後逐項確認齊備或退回補正,另可由中心匯入補充資料;全數齊備後使週期進入資料齊備階段。',
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
    '資料準備階段由中心逐項確認齊備;週期進入資料齊備階段後,委員可檢視已確認之資料並熟悉受稽機關背景。',
    '依排定日期到場實地查核。',
    '機關送審後逐項審查矯正措施,必要時退回補正(可多輪)。',
    '全數通過後,配合中心完成結案確認。',
  ],
  OBSERVER: [
    '週期進入資料齊備階段後,於中心設定的觀察員審閱時段內檢視機關資料,熟悉受稽機關背景。',
    '隨同到場觀摩實地稽核;於「稽核發現撰寫練習」撰寫練習發現,由指導委員檢視並回饋。',
    '缺失發布與矯正管考不對觀察員開放;可回顧練習內容與指導回饋。',
    '結案由中心與委員完成;您的練習紀錄將完整留存,供日後晉升參考。',
  ],
};
