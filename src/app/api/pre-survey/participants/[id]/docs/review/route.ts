import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { requireRole } from '@/lib/rbac';
import { errorResponse } from '@/lib/api';
import { writeAuditLog, extractRequestMeta } from '@/lib/audit-log';
import { assertSurveyYearWritable } from '@/lib/pre-survey-server';
import { notifyPresurveyDocReturned } from '@/lib/notify';
import { appBaseUrl } from '@/lib/baseUrl';

const Body = z.object({
  decision: z.enum(['APPROVE', 'RETURN']),
  reason: z.string().trim().max(1000).optional(),
});

/**
 * 審核個人文件(批B;僅中心)。
 *  - APPROVE(核可):docStatus=SUBMITTED(已繳交)、清空退補理由。
 *  - RETURN(退補,必填理由):docStatus=RETURNED(待補件)、記理由、通知受調者補件。
 * 前置:須為已送審(docStatus=SUBMITTED)狀態才可審。
 */
export async function POST(req: Request, { params }: { params: { id: string } }) {
  try {
    const user = await requireRole('SUPER_ADMIN');
    const body = Body.parse(await req.json());
    if (body.decision === 'RETURN' && !body.reason?.trim()) {
      return NextResponse.json({ error: '退補必須填寫理由' }, { status: 400 });
    }

    const participant = await prisma.surveyParticipant.findUnique({
      where: { id: params.id },
      select: { id: true, docStatus: true, year: true },
    });
    if (!participant) return NextResponse.json({ error: '受調人員不存在' }, { status: 404 });
    assertSurveyYearWritable(participant.year); // UAT 圖57:歷年資料唯讀
    if (participant.docStatus !== 'SUBMITTED') {
      return NextResponse.json({ error: '此文件目前不在待審（已繳交）狀態' }, { status: 400 });
    }

    if (body.decision === 'APPROVE') {
      // 核可:保持 docStatus=SUBMITTED(已繳交),以 docReviewedAt 記錄核可事實(區分「待審 vs 已核可」)
      await prisma.surveyParticipant.update({
        where: { id: participant.id },
        data: { docStatus: 'SUBMITTED', rejectReason: null, docReviewedAt: new Date() },
      });
    } else {
      await prisma.surveyParticipant.update({
        where: { id: participant.id },
        data: { docStatus: 'RETURNED', rejectReason: body.reason!.trim(), docReviewedAt: null },
      });
      try {
        await notifyPresurveyDocReturned({ participantId: participant.id, reason: body.reason!.trim(), appBaseUrl: appBaseUrl(req) });
      } catch (e) {
        console.error('presurvey doc return notify failed:', e);
      }
    }

    await writeAuditLog({
      actorId: user.id,
      action: 'SURVEY_DOC_REVIEW',
      entityType: 'SurveyParticipant',
      entityId: participant.id,
      after: { decision: body.decision },
      ...extractRequestMeta(req),
    });

    return NextResponse.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
