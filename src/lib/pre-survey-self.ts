import { prisma } from './db';
import { anonymousSessionLabel } from './pre-survey';
import type { SurveyAvailabilityStatus, SurveyParticipantKind } from './types';
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
  availabilities: { sessionId: string; status: string }[];
  finalAssignments: { session: { name: string; date: Date | null } }[];
};
export type SelfSession = { id: string; date: Date | null; isRequired: boolean; remark: string | null };
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
  const isObserver = participant.kind === 'OBSERVER';
  const statusMap = new Map(participant.availabilities.map((a) => [a.sessionId, a.status]));

  const myDocs = await prisma.evidence.findMany({
    where: { targetType: { in: ['SURVEY_CV', 'SURVEY_NDA', 'SURVEY_CV_PRIOR'] }, targetId: participant.id },
    select: { id: true, targetType: true, originalName: true },
  });
  const cvEv = myDocs.find((d) => d.targetType === 'SURVEY_CV') ?? null;
  const ndaEv = myDocs.find((d) => d.targetType === 'SURVEY_NDA') ?? null;
  const priorCvEv = myDocs.find((d) => d.targetType === 'SURVEY_CV_PRIOR') ?? null;

  return {
    participantId: participant.id,
    yearROC,
    kind: participant.kind as SurveyParticipantKind,
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
    // 觀察員不需經歷說明書,故過濾掉 CV_* 範本
    templates: templateDTOs.filter((t) => !(isObserver && t.slot.startsWith('CV_'))),
    transport: parseArr(participant.transport),
    diet: parseArr(participant.diet),
    travelNote: participant.travelNote,
    assignedLabels: participant.finalAssignments.map((fa) => `${mdLabel(fa.session.date)} ${fa.session.name}`),
    sessions: sessions.map((s, i) => ({
      id: s.id,
      anonLabel: anonymousSessionLabel(i, mdLabel(s.date)),
      isRequired: s.isRequired,
      remark: s.remark,
      status: (statusMap.get(s.id) as SurveyAvailabilityStatus | undefined) ?? null,
    })),
  };
}

/**
 * 儀表板整合用:載入使用者「最新一筆」事前場次調查(委員/觀察員);非受調者回 null。
 * (儀表板只給入口/狀態,故取最新年度那筆;完整年度切換仍於 /pre-survey。)
 */
export async function loadDashboardSelfSurvey(userId: string, accountEmail: string | null): Promise<SelfDTO | null> {
  const participant = await prisma.surveyParticipant.findFirst({
    where: { userId },
    orderBy: { year: 'desc' },
    include: {
      availabilities: { select: { sessionId: true, status: true } },
      finalAssignments: { include: { session: { select: { name: true, date: true } } } },
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
