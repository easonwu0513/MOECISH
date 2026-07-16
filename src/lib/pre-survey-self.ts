import { prisma } from './db';
import { anonymousSessionLabel } from './pre-survey';
import { SURVEY_TEMPLATE_SLOTS_BY_KIND, type SurveyAvailabilityStatus, type SurveyParticipantKind } from './types';
import type { SelfDTO } from '@/app/pre-survey/SurveySelfForm';

/**
 * 事前場次調查「自助 SelfDTO」建構(委員/觀察員自助頁與儀表板整合共用,避免兩處 DTO 組裝漂移)。
 */

/** DateTime(存 +08:00 當日 00:00)→ 台北 M/D 精簡標籤;null=待定。 */
function mdLabel(d: Date | null): string {
  if (!d) return '待定';
  const t = new Date(d.getTime() + 8 * 3600 * 1000);
  const [, m, day] = t.toISOString().slice(0, 10).split('-');
  return `${Number(m)}/${Number(day)}`;
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
  submittedAt: Date | null;
  docStatus: string;
  docReviewedAt: Date | null;
  rejectReason: string | null;
  transport: string | null;
  diet: string | null;
  travelNote: string | null;
  customValues: string | null; // #5:中心自訂欄位的值(JSON Record<columnId,string>)
  availabilities: { sessionId: string; status: string }[];
  finalAssignments: { session: { id: string; name: string; date: Date | null } }[];
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
    where: { targetType: { in: ['SURVEY_CV', 'SURVEY_NDA', 'SURVEY_CV_PRIOR'] }, targetId: participant.id },
    select: { id: true, targetType: true, originalName: true },
  });
  const cvEv = myDocs.find((d) => d.targetType === 'SURVEY_CV') ?? null;
  const ndaEv = myDocs.find((d) => d.targetType === 'SURVEY_NDA') ?? null;
  const priorCvEv = myDocs.find((d) => d.targetType === 'SURVEY_CV_PRIOR') ?? null;

  // #5:中心開放受調者填寫的自訂欄位(selfEditable);帶各欄現值與到期日供本人填報
  const selfColumns = await prisma.surveyCustomColumn.findMany({
    where: { year: participant.year, selfEditable: true },
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

  return {
    participantId: participant.id,
    yearROC,
    kind,
    accountEmail, // 自助頁主要信箱預設代入帳號 email
    phone: participant.phone,
    email: participant.email,
    phone2: participant.phone2,
    email2: participant.email2,
    submittedAt: participant.submittedAt?.toISOString() ?? null,
    docStatus: participant.docStatus,
    docReviewed: !!participant.docReviewedAt,
    rejectReason: participant.rejectReason,
    cvFile: cvEv ? { id: cvEv.id, name: cvEv.originalName } : null,
    ndaFile: ndaEv ? { id: ndaEv.id, name: ndaEv.originalName } : null,
    priorCvFile: priorCvEv ? { id: priorCvEv.id, name: priorCvEv.originalName } : null,
    // 依身分過濾公版範本(委員=CV+委員切結書;觀察員=觀察員切結書)
    templates: templateDTOs.filter((t) => kindSlots.includes(t.slot)),
    transport: parseArr(participant.transport),
    diet: parseArr(participant.diet),
    travelNote: participant.travelNote,
    customFields,
    // D UAT 隱私:已指派標籤只列本 kind 可見場次(觀察員排除委員專屬,如場次事後改為委員專屬亦不外洩);
    // 真實地名保留供指派後差旅二階使用(本人只見自己被指派的場次,非跨人清單)。
    assignedLabels: participant.finalAssignments
      .filter((fa) => kindSessionIds.has(fa.session.id))
      .map((fa) => `${mdLabel(fa.session.date)} ${fa.session.name}`),
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
      finalAssignments: { include: { session: { select: { id: true, name: true, date: true } } } },
    },
  });
  if (!participant) return null;

  const year = participant.year;
  const [sessions, templates] = await Promise.all([
    prisma.surveySession.findMany({ where: { year }, orderBy: { orderIndex: 'asc' } }),
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
