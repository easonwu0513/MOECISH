import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireRole } from '@/lib/rbac';
import { errorResponse } from '@/lib/api';
import { writeAuditLog, extractRequestMeta } from '@/lib/audit-log';
import { assertSurveyYearWritable } from '@/lib/pre-survey-server';
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
      select: { id: true, year: true },
    });
    if (!participant) return NextResponse.json({ error: '受調人員不存在' }, { status: 404 });
    assertSurveyYearWritable(participant.year); // UAT 圖57:歷年資料唯讀(歷年不再催辦)

    let recipientCount = 0;
    let skipped = false;
    // P1:該階段已完成者不寄信,回 nothingToRemind 供前端明確提示(避免中心誤以為已催)
    let nothingToRemind = false;
    try {
      const r =
        stage === 2
          ? await notifyPresurveyTravelRemind({ participantId: participant.id, appBaseUrl: appBaseUrl(req) })
          : await notifyPresurveyRemind({ participantId: participant.id, appBaseUrl: appBaseUrl(req) });
      recipientCount = r.recipientCount;
      skipped = r.skipped;
      nothingToRemind = 'nothingToRemind' in r ? !!r.nothingToRemind : false;
    } catch (e) {
      console.error('presurvey remind notify failed:', e);
    }

    await writeAuditLog({
      actorId: user.id,
      action: 'SURVEY_REMIND',
      entityType: 'SurveyParticipant',
      entityId: participant.id,
      after: { stage, recipientCount, skipped, nothingToRemind },
      ...extractRequestMeta(req),
    });

    return NextResponse.json({ ok: true, recipientCount, skipped, nothingToRemind });
  } catch (e) {
    return errorResponse(e);
  }
}
