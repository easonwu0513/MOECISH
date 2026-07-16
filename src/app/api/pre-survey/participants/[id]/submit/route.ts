import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { errorResponse } from '@/lib/api';
import { writeAuditLog, extractRequestMeta } from '@/lib/audit-log';
import { loadParticipantForAccess } from '@/lib/pre-survey-server';
import { canEditAvailability } from '@/lib/pre-survey-window';

/**
 * 送出一階意願(批A;本人或中心代送)。UAT 改為「所有場次必填」:
 *  - 填報時窗閘:本人須在時窗內或經中心開放補填(editUnlocked);中心代送(isAdmin)不受限;
 *  - 所有場次必填:逐一檢核本身分「可見」場次(觀察員僅共同場次)是否皆已填 OK/NA,未齊則擋下要求補齊(不再自動補 N/A);
 *  - 通過後設 submittedAt = now(標記已送出;於開放期間內仍可再編修後重送)。
 */
export async function POST(req: Request, { params }: { params: { id: string } }) {
  try {
    const { user, participant, isAdmin } = await loadParticipantForAccess(params.id);

    // 填報時窗閘(本人;中心代送不受限)
    if (!isAdmin) {
      const win = await prisma.surveyFillWindow.findUnique({
        where: { year: participant.year },
        select: { openAt: true, closeAt: true },
      });
      if (!canEditAvailability(win, participant.editUnlocked, new Date())) {
        return NextResponse.json(
          { error: '意願填報已截止或尚未開始；如需補填或變更，請聯絡中心開放。' },
          { status: 403 },
        );
      }
    }

    // 所有場次必填:僅計本身分「可見」場次(觀察員排除委員專屬),未答齊則擋下(不自動補 N/A)。
    const kindFilter = participant.kind === 'OBSERVER' ? { sharedWithObserver: true } : {};
    const [sessions, existing] = await Promise.all([
      prisma.surveySession.findMany({ where: { year: participant.year, ...kindFilter }, select: { id: true } }),
      prisma.sessionAvailability.findMany({ where: { participantId: participant.id }, select: { sessionId: true } }),
    ]);
    const filled = new Set(existing.map((a) => a.sessionId));
    const missing = sessions.filter((s) => !filled.has(s.id));
    if (missing.length > 0) {
      return NextResponse.json(
        { error: `尚有 ${missing.length} 個場次未填寫出席意願，請每個場次選擇 OK 或 NO 後再送出。` },
        { status: 400 },
      );
    }

    await prisma.surveyParticipant.update({
      where: { id: participant.id },
      data: { submittedAt: new Date() },
    });

    await writeAuditLog({
      actorId: user.id,
      action: 'SURVEY_WILLINGNESS_SUBMIT',
      entityType: 'SurveyParticipant',
      entityId: participant.id,
      ...extractRequestMeta(req),
    });

    return NextResponse.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
