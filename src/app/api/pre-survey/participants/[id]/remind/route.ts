import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireRole } from '@/lib/rbac';
import { errorResponse } from '@/lib/api';
import { writeAuditLog, extractRequestMeta } from '@/lib/audit-log';
import { notifyPresurveyRemind } from '@/lib/notify';
import { appBaseUrl } from '@/lib/baseUrl';

/** 催辦某受調人員填一階意願(批A;僅中心)。email + 站內鈴鐺,同人 24h 去重。 */
export async function POST(req: Request, { params }: { params: { id: string } }) {
  try {
    const user = await requireRole('SUPER_ADMIN');
    const participant = await prisma.surveyParticipant.findUnique({
      where: { id: params.id },
      select: { id: true },
    });
    if (!participant) return NextResponse.json({ error: '受調人員不存在' }, { status: 404 });

    let recipientCount = 0;
    try {
      const r = await notifyPresurveyRemind({ participantId: participant.id, appBaseUrl: appBaseUrl(req) });
      recipientCount = r.recipientCount;
    } catch (e) {
      console.error('presurvey remind notify failed:', e);
    }

    await writeAuditLog({
      actorId: user.id,
      action: 'SURVEY_REMIND',
      entityType: 'SurveyParticipant',
      entityId: participant.id,
      after: { recipientCount },
      ...extractRequestMeta(req),
    });

    return NextResponse.json({ ok: true, recipientCount });
  } catch (e) {
    return errorResponse(e);
  }
}
