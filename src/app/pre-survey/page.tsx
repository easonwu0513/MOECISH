import { redirect } from 'next/navigation';
import { prisma } from '@/lib/db';
import { auth } from '@/lib/auth';
import { AppShell } from '@/components/shell/AppShell';
import { Card } from '@/components/ui/Card';
import { FilterChipLink } from '@/components/ui/FilterChip';
import { canAccess } from '@/lib/access-policy';
import { anonymousSessionLabel } from '@/lib/pre-survey';
import type { Role, SurveyParticipantKind, SurveyAvailabilityStatus } from '@/lib/types';
import SurveyAdminBoard, { type AdminSessionDTO, type AdminParticipantDTO } from './SurveyAdminBoard';
import SurveySelfDashboard from './SurveySelfDashboard';
import { type SelfDTO } from './SurveySelfForm';

export const dynamic = 'force-dynamic';

/** DateTime(存 +08:00 當日 00:00)→ 台北 YYYY-MM-DD。 */
function toISODate(d: Date | null): string | null {
  if (!d) return null;
  const t = new Date(d.getTime() + 8 * 3600 * 1000);
  return t.toISOString().slice(0, 10);
}
/** 台北 M/D 精簡標籤(對齊調查場次的顯示習慣);null=待定。 */
function mdLabel(d: Date | null): string {
  const iso = toISODate(d);
  if (!iso) return '待定';
  const [, m, day] = iso.split('-');
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

export default async function PreSurveyPage({ searchParams }: { searchParams: { year?: string } }) {
  const session = await auth();
  if (!session) redirect('/login?callbackUrl=/pre-survey');
  const user = session.user;
  // 顯式列舉 + 未列舉即拒絕(fail-closed):機關(ORG_ADMIN)與未知角色一律導離;觀察員為第一線受調者故放行
  if (!canAccess('presurvey.view', user.role as Role, 'REMEDIATION')) redirect('/dashboard');

  const currentYear = new Date().getFullYear();
  const yearRows = await prisma.surveySession.findMany({
    distinct: ['year'],
    select: { year: true },
    orderBy: { year: 'desc' },
  });
  const partYearRows = await prisma.surveyParticipant.findMany({ distinct: ['year'], select: { year: true } });
  const yearSet = new Set<number>([...yearRows.map((r) => r.year), ...partYearRows.map((r) => r.year), currentYear]);
  const years = [...yearSet].sort((a, b) => b - a); // 工作清單降冪:最新年度在前
  const year =
    searchParams.year && yearSet.has(Number(searchParams.year)) ? Number(searchParams.year) : years[0] ?? currentYear;
  const yearROC = year - 1911;

  const sessions = await prisma.surveySession.findMany({ where: { year }, orderBy: { orderIndex: 'asc' } });

  // 公版範本(批B;兩視角共用):SurveyTemplate + 其實體檔 Evidence
  const templates = await prisma.surveyTemplate.findMany({ where: { year }, orderBy: { slot: 'asc' } });
  const templateFiles = templates.length
    ? await prisma.evidence.findMany({
        where: { targetType: 'SURVEY_TEMPLATE', targetId: { in: templates.map((t) => t.id) } },
        select: { id: true, targetId: true, originalName: true },
      })
    : [];
  const tfBy = new Map(templateFiles.map((f) => [f.targetId, f]));
  const templateDTOs = templates.map((t) => ({
    id: t.id,
    slot: t.slot,
    label: t.label,
    fileId: tfBy.get(t.id)?.id ?? null,
    fileName: tfBy.get(t.id)?.originalName ?? null,
  }));

  const crumbs = [{ label: '總覽', href: '/dashboard' }, { label: '事前場次調查' }];
  const shellUser = { name: user.name, email: user.email, role: user.role, organizationName: user.organizationName };

  const yearNav =
    years.length > 1 ? (
      <div className="mb-5 flex items-center gap-2 flex-wrap" role="group" aria-label="年度">
        {years.map((y) => (
          <FilterChipLink key={y} href={`/pre-survey?year=${y}`} selected={y === year}>
            {y - 1911} 年度
          </FilterChipLink>
        ))}
      </div>
    ) : null;

  // ── 委員/觀察員:自助填意願 ──
  if (user.role !== 'SUPER_ADMIN') {
    const participant = await prisma.surveyParticipant.findUnique({
      where: { year_userId: { year, userId: user.id } },
      include: {
        availabilities: { select: { sessionId: true, status: true } },
        finalAssignments: { include: { session: { select: { name: true, date: true } } } },
      },
    });

    return (
      <AppShell user={shellUser} crumbs={crumbs} watermark>
        <header className="mb-6 pb-5 border-b border-rule">
          <h1 className="text-headline-lg text-ink-900 tracking-tight">事前場次調查</h1>
          <p className="mt-2 text-body-sm text-ink-500">填寫各年度稽核場次的出席意願；經中心指派最終場次後，再填寫差旅與飲食。</p>
        </header>
        {yearNav}
        {!participant ? (
          <Card variant="outlined" className="text-center py-14">
            <p className="text-title text-ink-700">您尚未列入 {yearROC} 年度的調查名單</p>
            <p className="mt-1.5 text-body-sm text-ink-500">若應受調，請洽教育部轄下醫療領域資訊安全推動中心。</p>
          </Card>
        ) : (
          await (async () => {
            const statusMap = new Map(participant.availabilities.map((a) => [a.sessionId, a.status]));
            const isObserver = participant.kind === 'OBSERVER';
            const myDocs = await prisma.evidence.findMany({
              where: { targetType: { in: ['SURVEY_CV', 'SURVEY_NDA', 'SURVEY_CV_PRIOR'] }, targetId: participant.id },
              select: { id: true, targetType: true, originalName: true },
            });
            const cvEv = myDocs.find((d) => d.targetType === 'SURVEY_CV') ?? null;
            const ndaEv = myDocs.find((d) => d.targetType === 'SURVEY_NDA') ?? null;
            const priorCvEv = myDocs.find((d) => d.targetType === 'SURVEY_CV_PRIOR') ?? null;
            const selfData: SelfDTO = {
              participantId: participant.id,
              yearROC,
              kind: participant.kind as SurveyParticipantKind,
              phone: participant.phone,
              email: participant.email,
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
              assignedLabels: participant.finalAssignments.map(
                (fa) => `${mdLabel(fa.session.date)} ${fa.session.name}`,
              ),
              sessions: sessions.map((s, i) => ({
                id: s.id,
                anonLabel: anonymousSessionLabel(i, mdLabel(s.date)),
                isRequired: s.isRequired,
                remark: s.remark,
                status: (statusMap.get(s.id) as SurveyAvailabilityStatus | undefined) ?? null,
              })),
            };
            // key 綁 submittedAt+docStatus:送出/審核後伺服器資料變動時強制重掛,反映最新狀態
            //(意願三態鈕/差旅 pill 用樂觀 local state,編輯途中不 refresh,故不受此重掛影響)
            return <SurveySelfDashboard key={`${participant.id}-${selfData.submittedAt ?? 'draft'}-${participant.docStatus}-${participant.docReviewedAt ? 'r' : 'n'}`} data={selfData} userName={user.name} />;
          })()
        )}
      </AppShell>
    );
  }

  // ── 中心:管考總表 ──
  const participants = await prisma.surveyParticipant.findMany({
    where: { year },
    include: {
      user: { select: { name: true } },
      availabilities: { select: { sessionId: true, status: true } },
      finalAssignments: { select: { sessionId: true } },
    },
    orderBy: { invitedAt: 'asc' },
  });

  const [memberPool, observerPool] = await Promise.all([
    prisma.user.findMany({
      where: { isActive: true, OR: [{ role: 'AUDITOR' }, { roleGrants: { some: { role: 'AUDITOR', endedAt: null } } }] },
      select: { id: true, name: true, email: true },
      orderBy: { name: 'asc' },
    }),
    prisma.user.findMany({
      where: { isActive: true, OR: [{ role: 'OBSERVER' }, { roleGrants: { some: { role: 'OBSERVER', endedAt: null } } }] },
      select: { id: true, name: true, email: true },
      orderBy: { name: 'asc' },
    }),
  ]);

  const sessionDTOs: AdminSessionDTO[] = sessions.map((s) => ({
    id: s.id,
    name: s.name,
    dateLabel: mdLabel(s.date),
    dateInput: toISODate(s.date),
    isRequired: s.isRequired,
    remark: s.remark,
    targetMemberCount: s.targetMemberCount,
    targetObserverCount: s.targetObserverCount,
  }));

  // 中心自訂欄位(mockup 改版;年度制)
  const customColumns = await prisma.surveyCustomColumn.findMany({
    where: { year },
    orderBy: { orderIndex: 'asc' },
    select: { id: true, title: true },
  });

  // 各受調人員的 cv/切結書/舊版參考檔案(批B + mockup 改版;供中心審核預覽/管理)
  const pIds = participants.map((p) => p.id);
  const allDocs = pIds.length
    ? await prisma.evidence.findMany({
        where: { targetType: { in: ['SURVEY_CV', 'SURVEY_NDA', 'SURVEY_CV_PRIOR'] }, targetId: { in: pIds } },
        select: { id: true, targetId: true, targetType: true, originalName: true },
      })
    : [];
  type DocRef = { id: string; name: string } | null;
  const docBy = new Map<string, { cv: DocRef; nda: DocRef; priorCv: DocRef }>();
  for (const d of allDocs) {
    const cur = docBy.get(d.targetId) ?? { cv: null, nda: null, priorCv: null };
    if (d.targetType === 'SURVEY_CV') cur.cv = { id: d.id, name: d.originalName };
    else if (d.targetType === 'SURVEY_NDA') cur.nda = { id: d.id, name: d.originalName };
    else cur.priorCv = { id: d.id, name: d.originalName };
    docBy.set(d.targetId, cur);
  }

  const participantDTOs: AdminParticipantDTO[] = participants.map((p) => ({
    id: p.id,
    userId: p.userId,
    name: p.user.name,
    kind: p.kind as SurveyParticipantKind,
    committeeType: p.committeeType,
    phone: p.phone,
    email: p.email,
    note: p.note,
    replyStatus: p.replyStatus,
    docHandover: p.docHandover,
    submittedAt: p.submittedAt?.toISOString() ?? null,
    docStatus: p.docStatus,
    docReviewed: !!p.docReviewedAt,
    rejectReason: p.rejectReason,
    cvFile: docBy.get(p.id)?.cv ?? null,
    ndaFile: docBy.get(p.id)?.nda ?? null,
    priorCvFile: docBy.get(p.id)?.priorCv ?? null,
    transport: parseArr(p.transport),
    diet: parseArr(p.diet),
    travelNote: p.travelNote,
    customValues: parseObj(p.customValues),
    availability: Object.fromEntries(p.availabilities.map((a) => [a.sessionId, a.status])),
    finalSessionIds: p.finalAssignments.map((fa) => fa.sessionId),
  }));

  return (
    <AppShell user={shellUser} crumbs={crumbs} watermark>
      <header className="mb-6 pb-5 border-b border-rule">
        <h1 className="text-headline-lg text-ink-900 tracking-tight">事前場次調查</h1>
        <p className="mt-2 text-body-sm text-ink-500">
          規劃 {yearROC} 年度稽核場次、加入受調委員/觀察員，追蹤出席意願並指派最終場次。場次地點於意願調查階段對受調者以序號匿名。
        </p>
      </header>
      {yearNav}
      <SurveyAdminBoard
        yearROC={yearROC}
        sessions={sessionDTOs}
        participants={participantDTOs}
        memberPool={memberPool}
        observerPool={observerPool}
        templates={templateDTOs}
        customColumns={customColumns}
      />
    </AppShell>
  );
}
