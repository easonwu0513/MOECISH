import { prisma } from './db';
import { anonymousSessionLabel } from './pre-survey';
import { rocSlashWeekday } from './date';
import { canEditAvailability, fillWindowState, stage1WindowFor, stage2WindowFor, YEAR_WINDOWS_SELECT } from './pre-survey-window';
import { SURVEY_TEMPLATE_SLOTS_BY_KIND, type SurveyAvailabilityStatus, type SurveyParticipantKind } from './types';
import type { SelfDTO } from '@/app/pre-survey/SurveySelfForm';

/**
 * 事前場次調查「自助 SelfDTO」建構(委員/觀察員自助頁與儀表板整合共用,避免兩處 DTO 組裝漂移)。
 */

/** DateTime(存 +08:00 當日 00:00)→ 民國斜線日期含星期(115/7/20（一));null=待定。 */
function mdLabel(d: Date | null): string {
  return d ? rocSlashWeekday(d) : '待定';
}
/** 解析 JSON string[](transport/diet);壞資料回空陣列。 */
function parseArr(json: string | null): string[] {
  if (!json) return [];
  try {
    const a = JSON.parse(json);
    return Array.isArray(a) ? a.map(String) : [];
  } catch {
    return [];
  }
}
/** 解析 JSON Record<string,string>(customValues);壞資料回空物件。 */
function parseObj(json: string | null): Record<string, string> {
  if (!json) return {};
  try {
    const o = JSON.parse(json);
    return o && typeof o === 'object' && !Array.isArray(o) ? (o as Record<string, string>) : {};
  } catch {
    return {};
  }
}
/** DateTime(存 +08:00 當日 00:00)→ 台北 YYYY-MM-DD;null=null。 */
function toISODate(d: Date | null): string | null {
  if (!d) return null;
  return new Date(d.getTime() + 8 * 3600 * 1000).toISOString().slice(0, 10);
}

export type SelfParticipant = {
  id: string;
  year: number;
  kind: string;
  phone: string | null;
  email: string | null;
  phone2: string | null;
  email2: string | null;
  proxyName: string | null; // 代理聯絡人姓名/職稱(UAT 圖16)
  proxyEmail: string | null; // 代理聯絡人信箱(UAT;null=無代理)
  proxyPhone: string | null; // 代理聯絡人電話
  submittedAt: Date | null;
  editUnlocked: boolean; // 中心對此人開放一階補填/變更(意願/文件;逾第一時窗仍可編修)
  travelEditUnlocked: boolean; // 圖55:二階(差旅/飲食)補填開放獨立開關
  docStatus: string;
  docReviewedAt: Date | null;
  rejectReason: string | null;
  transport: string | null;
  diet: string | null;
  travelNote: string | null;
  customValues: string | null; // #5:中心自訂欄位的值(JSON Record<columnId,string>)
  availabilities: { sessionId: string; status: string }[];
  finalAssignments: { transport?: string | null; session: { id: string; name: string; date: Date | null; needsTravel?: boolean } }[];
};
export type SelfSession = {
  id: string;
  date: Date | null;
  name: string;
  isRequired: boolean;
  remark: string | null;
  anonymizeForMember: boolean;
  anonymizeForObserver: boolean;
  sharedWithObserver: boolean;
};
export type SelfTemplateDTO = { id: string; slot: string; label: string; fileId: string | null; fileName: string | null };

/** 由 participant(含 availabilities/finalAssignments)+ 該年度 sessions/templateDTOs 組出自助 SelfDTO。 */
export async function buildSelfDTO(opts: {
  participant: SelfParticipant;
  sessions: SelfSession[];
  templateDTOs: SelfTemplateDTO[];
  accountEmail: string | null;
}): Promise<SelfDTO> {
  const { participant, sessions, templateDTOs, accountEmail } = opts;
  const yearROC = participant.year - 1911;
  const kind = participant.kind as SurveyParticipantKind;
  // D UAT:觀察員不列入「委員專屬」場次(sharedWithObserver=false,如委員共識會議);委員看全部。序號依此清單重編。
  const kindSessions = kind === 'OBSERVER' ? sessions.filter((s) => s.sharedWithObserver) : sessions;
  const kindSessionIds = new Set(kindSessions.map((s) => s.id));
  const kindSlots = (SURVEY_TEMPLATE_SLOTS_BY_KIND[kind] ?? []) as readonly string[];
  const statusMap = new Map(participant.availabilities.map((a) => [a.sessionId, a.status]));

  const myDocs = await prisma.evidence.findMany({
    where: { targetType: { in: ['SURVEY_CV', 'SURVEY_NDA', 'SURVEY_CV_PRIOR', 'SURVEY_RECEIPT'] }, targetId: participant.id },
    select: { id: true, targetType: true, originalName: true },
  });
  const cvEv = myDocs.find((d) => d.targetType === 'SURVEY_CV') ?? null;
  const ndaEv = myDocs.find((d) => d.targetType === 'SURVEY_NDA') ?? null;
  const priorCvEv = myDocs.find((d) => d.targetType === 'SURVEY_CV_PRIOR') ?? null;
  const receiptEv = myDocs.find((d) => d.targetType === 'SURVEY_RECEIPT') ?? null; // UAT 圖30

  // #5:中心開放受調者填寫的自訂欄位(selfEditable);帶各欄現值與到期日供本人填報
  // UAT 圖58:依受調者類別過濾(kind=null 舊欄位兩類共用)
  const selfColumns = await prisma.surveyCustomColumn.findMany({
    where: { year: participant.year, selfEditable: true, OR: [{ kind: null }, { kind }] },
    orderBy: { orderIndex: 'asc' },
    select: { id: true, title: true, dueDate: true },
  });
  const cvValues = parseObj(participant.customValues);
  const customFields = selfColumns.map((c) => ({
    id: c.id,
    title: c.title,
    dueDate: toISODate(c.dueDate),
    value: cvValues[c.id] ?? '',
  }));

  // UAT 圖41:意願填報時窗依身分分流(委員/觀察員各自四欄;逾窗鎖定編修/送出;editUnlocked 兩窗皆豁免)
  const fillWin = await prisma.surveyFillWindow.findUnique({
    where: { year: participant.year },
    select: { ...YEAR_WINDOWS_SELECT, observerReceiptEnabled: true },
  });
  // UAT 圖30/36:領據上傳僅觀察員(依年度開關);委員領據改寄信收送,不走系統
  const receiptEnabled = kind === 'MEMBER' ? false : !!fillWin?.observerReceiptEnabled;
  const now = new Date();
  const stage1Win = stage1WindowFor(fillWin, kind);
  const canEdit = canEditAvailability(stage1Win, participant.editUnlocked, now);
  // UAT 圖55:二階豁免改讀 travelEditUnlocked(一階/二階開放各自獨立,互不連動)
  const travelWin = stage2WindowFor(fillWin, kind);
  const canTravel = canEditAvailability(travelWin, participant.travelEditUnlocked, now);

  return {
    participantId: participant.id,
    yearROC,
    kind,
    accountEmail, // 自助頁主要信箱預設代入帳號 email
    phone: participant.phone,
    email: participant.email,
    phone2: participant.phone2,
    email2: participant.email2,
    proxyName: participant.proxyName,
    proxyEmail: participant.proxyEmail,
    proxyPhone: participant.proxyPhone,
    submittedAt: participant.submittedAt?.toISOString() ?? null,
    // UAT 圖29:主要聯絡(信箱+電話)未填寫完整——總覽身分帶警示用
    contactIncomplete: !participant.email?.trim() || !participant.phone?.trim(),
    // UAT 填報時窗:canEditAvailability=false 時自助頁鎖定意願編修並顯示時窗說明
    canEditAvailability: canEdit,
    // UAT 圖7:文件上傳與意願同窗;差旅走第二時窗
    canUploadDocs: canEdit,
    canEditTravel: canTravel,
    travelWindow: travelWin && (travelWin.openAt || travelWin.closeAt)
      ? {
          openAt: travelWin.openAt?.toISOString() ?? null,
          closeAt: travelWin.closeAt?.toISOString() ?? null,
          state: fillWindowState(travelWin, now),
        }
      : null,
    editUnlocked: participant.editUnlocked,
    // UAT 圖41:顯示端亦依身分取窗(觀察員看觀察員自己的區間)
    fillWindow: stage1Win
      ? {
          openAt: stage1Win.openAt?.toISOString() ?? null,
          closeAt: stage1Win.closeAt?.toISOString() ?? null,
          state: fillWindowState(stage1Win, now),
        }
      : null,
    docStatus: participant.docStatus,
    docReviewed: !!participant.docReviewedAt,
    rejectReason: participant.rejectReason,
    cvFile: cvEv ? { id: cvEv.id, name: cvEv.originalName } : null,
    ndaFile: ndaEv ? { id: ndaEv.id, name: ndaEv.originalName } : null,
    priorCvFile: priorCvEv ? { id: priorCvEv.id, name: priorCvEv.originalName } : null,
    // UAT 圖30:領據(觀察員;年度開關制)
    receiptEnabled,
    receiptFile: receiptEv ? { id: receiptEv.id, name: receiptEv.originalName } : null,
    // 依身分過濾公版範本;觀察員領據範本僅開放年度顯示(委員費用領據常設)
    templates: templateDTOs.filter(
      (t) => kindSlots.includes(t.slot) && (t.slot !== 'RECEIPT_OBSERVER' || receiptEnabled),
    ),
    transport: parseArr(participant.transport),
    diet: parseArr(participant.diet),
    travelNote: participant.travelNote,
    customFields,
    // D UAT 隱私:已指派標籤只列本 kind 可見場次(觀察員排除委員專屬,如場次事後改為委員專屬亦不外洩);
    // 真實地名保留供指派後差旅二階使用(本人只見自己被指派的場次,非跨人清單)。
    // UAT 圖26:指派場次一律依辦理日期排序(未定最後),與場次清單同一時間軸
    assignedLabels: [...participant.finalAssignments]
      .filter((fa) => kindSessionIds.has(fa.session.id))
      .sort((a, b) => (a.session.date?.getTime() ?? Infinity) - (b.session.date?.getTime() ?? Infinity))
      .map((fa) => `${mdLabel(fa.session.date)} ${fa.session.name}`),
    // UAT 圖14:逐場次差旅——每個被指派場次的交通各自填(needsTravel=false 的線上場次免填)
    assignedSessions: [...participant.finalAssignments]
      .filter((fa) => kindSessionIds.has(fa.session.id))
      .sort((a, b) => (a.session.date?.getTime() ?? Infinity) - (b.session.date?.getTime() ?? Infinity))
      .map((fa) => ({
        sessionId: fa.session.id,
        label: `${mdLabel(fa.session.date)} ${fa.session.name}`,
        needsTravel: fa.session.needsTravel ?? true,
        transport: parseArr(fa.transport ?? null),
      })),
    sessions: kindSessions.map((s, i) => {
      // UAT:每場次可各自關閉對委員/觀察員的匿名(如委員共識會議);關閉則顯真實地名,否則仍以穩定序號匿名。
      // 僅送出計算後的 anonLabel,匿名場次的真實地名不會外洩到 client。
      const anon = kind === 'OBSERVER' ? s.anonymizeForObserver : s.anonymizeForMember;
      const md = mdLabel(s.date);
      return {
        id: s.id,
        anonLabel: anon ? anonymousSessionLabel(i, md) : `${md} ${s.name}`.trim(),
        isRequired: s.isRequired,
        remark: s.remark,
        status: (statusMap.get(s.id) as SurveyAvailabilityStatus | undefined) ?? null,
      };
    }),
  };
}

/**
 * 儀表板整合用:載入使用者「最新一筆」事前場次調查(委員/觀察員);非受調者回 null。
 * (儀表板只給入口/狀態,故取最新年度那筆;完整年度切換與雙身分分別填報仍於 /pre-survey。)
 * #6:同人同年度可兼委員與觀察員 → orderBy 加 kind 使選取確定性(最新年度、MEMBER 優先);完整雙身分於 /pre-survey 切換。
 */
export async function loadDashboardSelfSurvey(userId: string, accountEmail: string | null): Promise<SelfDTO | null> {
  const participant = await prisma.surveyParticipant.findFirst({
    where: { userId },
    orderBy: [{ year: 'desc' }, { kind: 'asc' }],
    include: {
      availabilities: { select: { sessionId: true, status: true } },
      finalAssignments: { include: { session: { select: { id: true, name: true, date: true, needsTravel: true } } } },
    },
  });
  if (!participant) return null;

  const year = participant.year;
  const [sessions, templates] = await Promise.all([
    // UAT 圖2:依辦理日期排序(未定最後、同日依序號)——序號隨清單順序重編,與中心管考/匯出一致
    prisma.surveySession.findMany({
      where: { year },
      orderBy: [{ date: { sort: 'asc', nulls: 'last' } }, { orderIndex: 'asc' }],
    }),
    prisma.surveyTemplate.findMany({ where: { year }, orderBy: { slot: 'asc' } }),
  ]);
  const templateFiles = templates.length
    ? await prisma.evidence.findMany({
        where: { targetType: 'SURVEY_TEMPLATE', targetId: { in: templates.map((t) => t.id) } },
        select: { id: true, targetId: true, originalName: true },
      })
    : [];
  const tfBy = new Map(templateFiles.map((f) => [f.targetId, f]));
  const templateDTOs: SelfTemplateDTO[] = templates.map((t) => ({
    id: t.id,
    slot: t.slot,
    label: t.label,
    fileId: tfBy.get(t.id)?.id ?? null,
    fileName: tfBy.get(t.id)?.originalName ?? null,
  }));

  return buildSelfDTO({ participant, sessions, templateDTOs, accountEmail });
}
