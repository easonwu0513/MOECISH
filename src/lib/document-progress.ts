import { CYCLE_STATUSES, type CycleStatus } from './types';

/**
 * 七章文件進度尺(重塑 R4 / W2)—— 機關視角「文件進度」的單一真值來源(SoT)。
 *
 * 現況痛點:週期首頁 4 張 StatusTile 各自算進度,且與 prep/checklist/deficiencies 各子頁重複計算,
 * 語意分散、易漂移。此處把「機關走完一次稽核所產出/經歷的七個文件章節」收斂為一份有序清單,
 * 首頁進度尺與(後續)各子頁導覽皆由此派生,杜絕多處各算各的。
 *
 * 七章(依週期時序):
 *   1 技術檢測應備文件  2 實地稽核應備文件  3 資通安全檢核表
 *   4 實地稽核(現場)   5 缺失矯正措施      6 改善報告(用印)  7 結案
 *
 * 純函式、無 I/O:輸入為已彙整的計數/狀態,方便測試與跨頁共用。
 */

export type ChapterStatus = 'done' | 'active' | 'todo' | 'locked';

export type DocumentChapter = {
  key: 'prep-tech' | 'prep-onsite' | 'checklist' | 'onsite' | 'remediation' | 'report' | 'closed';
  index: number; // 1..7
  label: string;
  status: ChapterStatus;
  /** 一句話狀態(如「3/5 已確認」「已送出」「尚未發布」)。 */
  detail: string;
  /** 直達補正/辦理頁;無(等待中心/純里程碑)則 undefined。 */
  href?: string;
  /** locked 時的說明。 */
  lockedHint?: string;
};

export type DocumentProgressInput = {
  cycleId: string;
  status: CycleStatus;
  prepTech: { confirmed: number; total: number };
  prepOnsite: { confirmed: number; total: number };
  checklist: { answered: number; total: number; submitted: boolean };
  deficiency: { passed: number; total: number };
  report: { submitted: boolean; confirmed: boolean };
};

function phaseIdx(s: CycleStatus): number {
  const i = (CYCLE_STATUSES as readonly string[]).indexOf(s);
  return i < 0 ? 0 : i;
}
const IDX = {
  DRAFT: phaseIdx('DRAFT'),
  PREPARATION: phaseIdx('PREPARATION'),
  READY: phaseIdx('READY'),
  ONSITE: phaseIdx('ONSITE'),
  REPORT_ISSUED: phaseIdx('REPORT_ISSUED'),
  REMEDIATION: phaseIdx('REMEDIATION'),
  CLOSED: phaseIdx('CLOSED'),
};

/** 資料準備一章(技術檢測 / 實地稽核共用邏輯)。 */
function prepChapter(
  key: 'prep-tech' | 'prep-onsite',
  index: number,
  label: string,
  cur: number,
  counts: { confirmed: number; total: number },
  cycleId: string,
): DocumentChapter {
  const href = `/cycles/${cycleId}/prep`;
  if (counts.total === 0) {
    // 無此區應備項目:視為已完成(不擋進度),但註明無需求。
    return { key, index, label, status: 'done', detail: '無應備項目', href };
  }
  const allConfirmed = counts.confirmed === counts.total;
  if (cur === IDX.DRAFT) {
    return { key, index, label, status: 'locked', detail: '待中心開放', href: undefined, lockedHint: '中心推進至「資料準備中」後開放填報' };
  }
  if (allConfirmed) {
    return { key, index, label, status: 'done', detail: `${counts.confirmed}/${counts.total} 已確認齊備`, href };
  }
  if (cur === IDX.PREPARATION) {
    return { key, index, label, status: 'active', detail: `${counts.confirmed}/${counts.total} 已確認`, href };
  }
  // 已過資料準備階段但未全確認(少見):仍列已辦理,以計數呈現。
  return { key, index, label, status: 'done', detail: `${counts.confirmed}/${counts.total} 已確認`, href };
}

export function deriveDocumentChapters(input: DocumentProgressInput): DocumentChapter[] {
  const cur = phaseIdx(input.status);
  const { cycleId } = input;
  const allPassed = input.deficiency.total > 0 && input.deficiency.passed === input.deficiency.total;
  const chapters: DocumentChapter[] = [];

  // 1 技術檢測應備文件
  chapters.push(prepChapter('prep-tech', 1, '技術檢測應備文件', cur, input.prepTech, cycleId));
  // 2 實地稽核應備文件
  chapters.push(prepChapter('prep-onsite', 2, '實地稽核應備文件', cur, input.prepOnsite, cycleId));

  // 3 資通安全檢核表
  {
    const href = `/cycles/${cycleId}/checklist`;
    const { answered, total, submitted } = input.checklist;
    if (cur === IDX.DRAFT) {
      chapters.push({ key: 'checklist', index: 3, label: '資通安全檢核表', status: 'locked', detail: '待中心開放', lockedHint: '中心推進至「資料準備中」後開放填報' });
    } else if (submitted) {
      chapters.push({ key: 'checklist', index: 3, label: '資通安全檢核表', status: 'done', detail: '已送出', href });
    } else if (cur === IDX.PREPARATION) {
      chapters.push({ key: 'checklist', index: 3, label: '資通安全檢核表', status: 'active', detail: total > 0 ? `${answered}/${total} 已填` : '逐題填報中', href });
    } else {
      // 已過準備階段(通常已送出);未送出則以計數呈現,仍可檢視
      chapters.push({ key: 'checklist', index: 3, label: '資通安全檢核表', status: 'done', detail: total > 0 ? `${answered}/${total} 已填` : '—', href });
    }
  }

  // 4 實地稽核(現場;機關無動作,為里程碑)
  {
    let status: ChapterStatus;
    let detail: string;
    if (cur >= IDX.REPORT_ISSUED) { status = 'done'; detail = '已完成'; }
    else if (cur === IDX.ONSITE) { status = 'active'; detail = '委員現場稽核中'; }
    else { status = 'todo'; detail = '資料齊備後由中心安排'; }
    chapters.push({ key: 'onsite', index: 4, label: '實地稽核', status, detail });
  }

  // 5 缺失矯正措施
  {
    const href = `/cycles/${cycleId}/deficiencies`;
    const { passed, total } = input.deficiency;
    if (cur < IDX.REPORT_ISSUED) {
      chapters.push({ key: 'remediation', index: 5, label: '缺失矯正措施', status: 'locked', detail: '尚未發布', lockedHint: '缺失發布後開放填報' });
    } else if (input.status === 'CLOSED' || allPassed) {
      chapters.push({ key: 'remediation', index: 5, label: '缺失矯正措施', status: 'done', detail: total > 0 ? `${passed}/${total} 通過` : '無缺失', href });
    } else {
      chapters.push({ key: 'remediation', index: 5, label: '缺失矯正措施', status: 'active', detail: total > 0 ? `${passed}/${total} 通過` : '待中心發布缺失', href });
    }
  }

  // 6 改善報告(用印上傳):面板即在週期首頁(進度尺下方),故不設跨頁連結,避免同頁重載。
  {
    if (input.report.confirmed || input.status === 'CLOSED') {
      chapters.push({ key: 'report', index: 6, label: '改善報告(用印)', status: 'done', detail: input.report.confirmed ? '已繳交確認' : '已結案' });
    } else if (allPassed && input.status === 'REMEDIATION') {
      chapters.push({ key: 'report', index: 6, label: '改善報告(用印)', status: 'active', detail: input.report.submitted ? '待中心確認' : '請於下方列印用印後上傳' });
    } else {
      chapters.push({ key: 'report', index: 6, label: '改善報告(用印)', status: 'locked', detail: '待矯正全數通過', lockedHint: '缺失矯正全數通過後開放' });
    }
  }

  // 7 結案
  {
    if (input.status === 'CLOSED') {
      chapters.push({ key: 'closed', index: 7, label: '結案', status: 'done', detail: '本年度稽核已結案' });
    } else {
      chapters.push({ key: 'closed', index: 7, label: '結案', status: 'todo', detail: '用印報告確認後結案' });
    }
  }

  return chapters;
}

/** 進度尺整體完成度:已完成章節數 / 總章節數(供標頭顯示)。 */
export function chaptersDonePct(chapters: DocumentChapter[]): number {
  if (chapters.length === 0) return 0;
  const done = chapters.filter((c) => c.status === 'done').length;
  return Math.round((done / chapters.length) * 100);
}
