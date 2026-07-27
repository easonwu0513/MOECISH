import type { Tone } from './tone';
import type { SurveyAvailabilityStatus, SurveyParticipantKind, SurveyDocStatus } from './types';

/**
 * 事前場次調查(批A)共用純函式。
 * ⚠️ 匿名化:委員/觀察員填意願時,場次「地名」一律隱藏,改以穩定序號呈現(避免挑場/迴避);
 *    中心(SUPER_ADMIN)看真實地名。序號依 orderIndex 穩定排序,勿用資料庫回傳順序以免序號漂移。
 */

/** 對受調者匿名化的場次標籤:「{日期} 稽核場次 {序號}」(序號 = 排序後 index + 1)。 */
export function anonymousSessionLabel(index: number, dateLabel: string): string {
  const d = dateLabel.trim();
  return d ? `${d} 稽核場次 ${index + 1}` : `稽核場次 ${index + 1}`;
}

/** 意願二態 → 色調(OK 綠 / NO(值 NA)灰)。 */
export function availabilityTone(status: string | null | undefined): Tone {
  switch (status as SurveyAvailabilityStatus) {
    case 'OK':
      return 'success';
    case 'NA':
      return 'neutral';
    default:
      return 'neutral';
  }
}

/** 達標比率 → 色調(達標綠、否則主色)。 */
export function targetTone(okCount: number, target: number): Tone {
  return target > 0 && okCount >= target ? 'success' : 'primary';
}

/** 委員 vs 觀察員的達標分母欄位名(場次上兩個目標數擇一)。 */
export function targetCountField(kind: SurveyParticipantKind): 'targetMemberCount' | 'targetObserverCount' {
  return kind === 'OBSERVER' ? 'targetObserverCount' : 'targetMemberCount';
}

/** JSON 字串陣列長度(壞資料/空值視為 0);供二階完成度判定共用。 */
export function jsonArrayLength(json: string | null | undefined): number {
  if (!json) return 0;
  try {
    const a = JSON.parse(json);
    return Array.isArray(a) ? a.length : 0;
  } catch {
    return 0;
  }
}

/**
 * P1:一階(意願+文件)實際缺口——催辦信、總覽待辦、按鈕狀態共用同一判定,
 * 避免「已送意願只差文件」的人收到「請填寫出席意願」(圖69 的信件版兄弟案)。
 */
export type Stage1Gap = 'DOC_RETURNED' | 'NEED_BOTH' | 'NEED_DOCS' | 'NEED_WILLINGNESS' | 'DONE';
export function stage1Gap(submittedAt: Date | string | null, docStatus: string): Stage1Gap {
  if (docStatus === 'RETURNED') return 'DOC_RETURNED';
  const docsDone = docStatus === 'SUBMITTED';
  if (!submittedAt && !docsDone) return 'NEED_BOTH';
  if (!docsDone) return 'NEED_DOCS';
  if (!submittedAt) return 'NEED_WILLINGNESS';
  return 'DONE';
}

/**
 * P1:二階(差旅/飲食)完成度——需差旅場次皆已填交通 + 已填飲食才算完成;
 * 無「需差旅」場次者 applicable=false(全線上場次的人不該被催二階)。
 */
export function stage2Completeness(
  assignments: { transport: string | null; needsTravel: boolean }[],
  dietJson: string | null,
): { applicable: boolean; complete: boolean; missingTransport: number } {
  const travel = assignments.filter((a) => a.needsTravel);
  if (travel.length === 0) return { applicable: false, complete: true, missingTransport: 0 };
  const missingTransport = travel.filter((a) => jsonArrayLength(a.transport) === 0).length;
  return {
    applicable: true,
    complete: missingTransport === 0 && jsonArrayLength(dietJson) > 0,
    missingTransport,
  };
}

/** 文件繳交狀態 → 色調(批B):未繳交灰 / 已繳交綠 / 待補件黃。 */
export function surveyDocTone(status: string | null | undefined): Tone {
  switch (status as SurveyDocStatus) {
    case 'SUBMITTED':
      return 'success';
    case 'RETURNED':
      return 'warning';
    case 'NONE':
    default:
      return 'neutral';
  }
}

/** 文件狀態顯示(批B):已送審(SUBMITTED)再依 docReviewed 區分「審核中 vs 已核可」;供中心/自助共用。 */
export function surveyDocDisplay(docStatus: string, docReviewed: boolean): { label: string; tone: Tone } {
  if ((docStatus as SurveyDocStatus) === 'SUBMITTED') {
    return docReviewed ? { label: '已核可', tone: 'success' } : { label: '審核中', tone: 'primary' };
  }
  if ((docStatus as SurveyDocStatus) === 'RETURNED') return { label: '待補件', tone: 'warning' };
  return { label: '未繳交', tone: 'neutral' };
}
