import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { errorResponse } from '@/lib/api';
import { writeAuditLog, extractRequestMeta } from '@/lib/audit-log';
import { loadParticipantForAccess } from '@/lib/pre-survey-server';
import { canEditAvailability, stage1WindowFor, YEAR_WINDOWS_SELECT } from '@/lib/pre-survey-window';

/**
 * 送審個人文件(批B;本人或中心)。前置:委員須有 cv+切結書、觀察員須有切結書。
 * 設 docStatus=SUBMITTED、docSubmittedAt=now、清空退補理由。
 */
export async function POST(req: Request, { params }: { params: { id: string } }) {
  try {
    const { user, participant, isAdmin } = await loadParticipantForAccess(params.id);

    // 送審僅在 NONE(未繳交)或 RETURNED(待補件)時可觸發;已送審(SUBMITTED)不可重複送(防覆寫 docSubmittedAt/清 rejectReason)
    if (participant.docStatus === 'SUBMITTED') {
      return NextResponse.json({ error: '文件已送審，待中心審核' }, { status: 400 });
    }

    // UAT 圖7:文件送審與意願共用第一時窗(伺服器端強制;中心代送不受限、editUnlocked 豁免)
    if (!isAdmin) {
      const win = await prisma.surveyFillWindow.findUnique({
        where: { year: participant.year },
        select: YEAR_WINDOWS_SELECT,
      });
      if (!canEditAvailability(stage1WindowFor(win, participant.kind), participant.editUnlocked, new Date())) {
        return NextResponse.json({ error: '文件送審未在開放時間內；如需補件，請聯絡中心開放。' }, { status: 403 });
      }
    }

    const [cv, nda] = await Promise.all([
      prisma.evidence.count({ where: { targetType: 'SURVEY_CV', targetId: participant.id } }),
      prisma.evidence.count({ where: { targetType: 'SURVEY_NDA', targetId: participant.id } }),
    ]);
    const needCv = participant.kind === 'MEMBER';
    if (needCv && cv === 0) {
      return NextResponse.json({ error: '請先上傳經歷說明書' }, { status: 400 });
    }
    if (nda === 0) {
      return NextResponse.json({ error: '請先上傳聘任同意暨保密切結書' }, { status: 400 });
    }

    await prisma.surveyParticipant.update({
      where: { id: participant.id },
      // 重新送審清 docReviewedAt(需中心重新核可)
      data: { docStatus: 'SUBMITTED', docSubmittedAt: new Date(), rejectReason: null, docReviewedAt: null },
    });

    await writeAuditLog({
      actorId: user.id,
      action: 'SURVEY_DOC_SUBMIT',
      entityType: 'SurveyParticipant',
      entityId: participant.id,
      ...extractRequestMeta(req),
    });

    return NextResponse.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
