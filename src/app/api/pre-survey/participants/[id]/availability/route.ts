import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { errorResponse } from '@/lib/api';
import { loadParticipantForAccess } from '@/lib/pre-survey-server';
import { SURVEY_AVAILABILITY_STATUSES } from '@/lib/types';

const Body = z.object({
  sessionId: z.string().min(1),
  status: z.enum(SURVEY_AVAILABILITY_STATUSES),
});

/**
 * 設定某受調人員對某場次的意願(批A;本人或中心代填)。upsert 至 SessionAvailability。
 * 場次須為同年度(防跨年度/跨人竄改)。
 */
export async function PUT(req: Request, { params }: { params: { id: string } }) {
  try {
    const { participant } = await loadParticipantForAccess(params.id);
    const body = Body.parse(await req.json());

    const session = await prisma.surveySession.findUnique({
      where: { id: body.sessionId },
      select: { id: true, year: true },
    });
    if (!session || session.year !== participant.year) {
      return NextResponse.json({ error: '場次不存在或不屬於此年度' }, { status: 400 });
    }

    await prisma.sessionAvailability.upsert({
      where: { participantId_sessionId: { participantId: participant.id, sessionId: body.sessionId } },
      create: { participantId: participant.id, sessionId: body.sessionId, status: body.status },
      update: { status: body.status },
    });

    return NextResponse.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
