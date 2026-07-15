import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { errorResponse } from '@/lib/api';
import { writeAuditLog, extractRequestMeta } from '@/lib/audit-log';
import { loadParticipantForAccess } from '@/lib/pre-survey-server';

/**
 * 送出一階意願(批A;本人或中心代送)。副作用比照 mockup:
 *  - 未填意願的場次自動補為 N/A(遍歷該年度全部場次,無 availability 者建 NA);
 *  - 設 submittedAt = now(標記已送出;不鎖定,之後仍可再編修後重送)。
 * 交易內完成,確保「補 NA + 標記送出」原子。
 */
export async function POST(req: Request, { params }: { params: { id: string } }) {
  try {
    const { user, participant } = await loadParticipantForAccess(params.id);

    await prisma.$transaction(async (tx) => {
      const [sessions, existing] = await Promise.all([
        tx.surveySession.findMany({ where: { year: participant.year }, select: { id: true } }),
        tx.sessionAvailability.findMany({ where: { participantId: participant.id }, select: { sessionId: true } }),
      ]);
      const filled = new Set(existing.map((a) => a.sessionId));
      const missing = sessions.filter((s) => !filled.has(s.id));
      if (missing.length > 0) {
        // skipDuplicates:雙擊送出/與 availability PUT 競態時,補 NA 對並發冪等,不撞 @@unique 觸發偽 409
        await tx.sessionAvailability.createMany({
          data: missing.map((s) => ({ participantId: participant.id, sessionId: s.id, status: 'NA' })),
          skipDuplicates: true,
        });
      }
      await tx.surveyParticipant.update({
        where: { id: participant.id },
        data: { submittedAt: new Date() },
      });
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
