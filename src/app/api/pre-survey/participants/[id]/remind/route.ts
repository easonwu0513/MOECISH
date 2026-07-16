import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireRole } from '@/lib/rbac';
import { errorResponse } from '@/lib/api';
import { writeAuditLog, extractRequestMeta } from '@/lib/audit-log';
import { notifyPresurveyRemind, notifyPresurveyTravelRemind } from '@/lib/notify';
import { appBaseUrl } from '@/lib/baseUrl';

/**
 * 催辦某受調人員(批A + mockup 改版;僅中心)。email + 站內鈴鐺,同人同階段 24h 去重。
 *  - stage=1(預設):催一階出席意願與文件。
 *  - stage=2:催二階差旅與飲食(僅已指派最終場次者;未指派則不寄,回 recipientCount=0)。
 */
export async function POST(req: Request, { params }: { params: { id: string } }) {
  try {
    const user = await requireRole('SUPER_ADMIN');
    const stage = new URL(req.url).searchParams.get('stage') === '2' ? 2 : 1;
    const participant = await prisma.surveyParticipant.findUnique({
      where: { id: params.id },
      select: { id: true },
    });
    if (!participant) return NextResponse.json({ error: '受調人員不存在' }, { status: 404 });

    let recipientCount = 0;
    let skipped = false;
    try {
      const r =
        stage === 2
          ? await notifyPresurveyTravelRemind({ participantId: participant.id, appBaseUrl: appBaseUrl(req) })
          : await notifyPresurveyRemind({ participantId: participant.id, appBaseUrl: appBaseUrl(req) });
      recipientCount = r.recipientCount;
      skipped = r.skipped;
    } catch (e) {
      console.error('presurvey remind notify failed:', e);
    }

    await writeAuditLog({
      actorId: user.id,
      action: 'SURVEY_REMIND',
      entityType: 'SurveyParticipant',
      entityId: participant.id,
      after: { stage, recipientCount, skipped },
      ...extractRequestMeta(req),
    });

    return NextResponse.json({ ok: true, recipientCount, skipped });
  } catch (e) {
    return errorResponse(e);
  }
}
