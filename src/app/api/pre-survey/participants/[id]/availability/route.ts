import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { errorResponse } from '@/lib/api';
import { writeAuditLog, extractRequestMeta } from '@/lib/audit-log';
import { loadParticipantForAccess } from '@/lib/pre-survey-server';
import { canEditAvailability, stage1WindowFor, YEAR_WINDOWS_SELECT } from '@/lib/pre-survey-window';
import { SURVEY_AVAILABILITY_STATUSES } from '@/lib/types';

const Body = z.object({
  sessionId: z.string().min(1),
  status: z.enum(SURVEY_AVAILABILITY_STATUSES),
  // UAT 圖6 安全鎖:中心代改意願必附「變動原因」(進稽核軌跡);本人自填不需
  reason: z.string().trim().max(500).optional(),
});

/**
 * 設定某受調人員對某場次的意願(批A;本人或中心代填)。upsert 至 SessionAvailability。
 * 場次須為同年度(防跨年度/跨人竄改)。
 */
export async function PUT(req: Request, { params }: { params: { id: string } }) {
  try {
    const { user, participant, isAdmin } = await loadParticipantForAccess(params.id);
    const body = Body.parse(await req.json());

    // UAT 圖6 安全鎖(伺服器端強制,防繞過前端):中心於管考表代改意願,必附變動原因
    if (isAdmin && !body.reason) {
      return NextResponse.json({ error: '中心修改意願須填寫變動原因（解鎖修改）' }, { status: 400 });
    }

    // 填報時窗閘:本人須在時窗內或經中心開放補填(editUnlocked);中心代填(isAdmin)不受限。
    if (!isAdmin) {
      const win = await prisma.surveyFillWindow.findUnique({
        where: { year: participant.year },
        select: YEAR_WINDOWS_SELECT,
      });
      if (!canEditAvailability(stage1WindowFor(win, participant.kind), participant.editUnlocked, new Date())) {
        return NextResponse.json(
          { error: '意願填報已截止或尚未開始；如需補填或變更，請聯絡中心開放。' },
          { status: 403 },
        );
      }
    }

    const session = await prisma.surveySession.findUnique({
      where: { id: body.sessionId },
      select: { id: true, year: true, sharedWithObserver: true },
    });
    if (!session || session.year !== participant.year) {
      return NextResponse.json({ error: '場次不存在或不屬於此年度' }, { status: 400 });
    }
    // D 防禦縱深:觀察員不得對「委員專屬」場次(sharedWithObserver=false)寫意願(client 本就收不到此場次,擋 crafted request)。
    if (participant.kind === 'OBSERVER' && !session.sharedWithObserver) {
      return NextResponse.json({ error: '此場次不開放觀察員填報' }, { status: 400 });
    }

    await prisma.sessionAvailability.upsert({
      where: { participantId_sessionId: { participantId: participant.id, sessionId: body.sessionId } },
      create: { participantId: participant.id, sessionId: body.sessionId, status: body.status },
      update: { status: body.status },
    });

    // 中心代改留痕(UAT 圖6):誰、對誰的哪個場次、改成什麼、為什麼
    if (isAdmin) {
      await writeAuditLog({
        actorId: user.id,
        action: 'SURVEY_AVAILABILITY_ADMIN_SET',
        entityType: 'SurveyParticipant',
        entityId: participant.id,
        after: { sessionId: body.sessionId, status: body.status, reason: body.reason },
        ...extractRequestMeta(req),
      });
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
