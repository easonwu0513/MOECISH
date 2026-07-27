import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { errorResponse } from '@/lib/api';
import { writeAuditLog, extractRequestMeta } from '@/lib/audit-log';
import { loadParticipantForAccess, assertSurveyYearWritable } from '@/lib/pre-survey-server';
import { canEditAvailability, stage1WindowFor, YEAR_WINDOWS_SELECT } from '@/lib/pre-survey-window';

/**
 * 送出一階意願(批A;本人或中心代送)。UAT 改為「所有場次必填」:
 *  - 填報時窗閘:本人須在時窗內或經中心開放補填(editUnlocked);中心代送(isAdmin)不受限;
 *  - 所有場次必填:逐一檢核本身分「可見」場次(觀察員僅共同場次)是否皆已填 OK/NA,未齊則擋下要求補齊(不再自動補 N/A);
 *  - 通過後設 submittedAt = now(標記已送出;於開放期間內仍可再編修後重送)。
 */
export async function POST(req: Request, { params }: { params: { id: string } }) {
  try {
    const { user, participant, isAdmin } = await loadParticipantForAccess(params.id);
    assertSurveyYearWritable(participant.year); // UAT 圖57:歷年資料唯讀

    // 填報時窗閘(本人;中心代送不受限)
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

    // UAT 圖21:主要聯絡方式必填——送出意願前信箱與電話皆須在(信箱可為帳號預代入後儲存的值)
    if (!participant.email?.trim() || !participant.phone?.trim()) {
      return NextResponse.json(
        { error: '請先於「聯絡資訊」填寫並儲存主要電子郵件與聯絡電話後再送出。' },
        { status: 400 },
      );
    }

    // UAT 圖63:文件須先上傳並送審才可送出意願(防「只填意願不交文件」;中心代送不受限)
    if (!isAdmin && participant.docStatus !== 'SUBMITTED') {
      return NextResponse.json(
        {
          error:
            participant.kind === 'OBSERVER'
              ? '請先於「文件繳交」上傳聘任同意暨保密切結書並按「送審文件」後，再送出意願。'
              : '請先於「文件繳交」上傳經歷說明書與聘任同意暨保密切結書並按「送審文件」後，再送出意願。',
        },
        { status: 400 },
      );
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

    // UAT 圖52:補填開放(editUnlocked)為一次性——本人於補填期間「意願+文件皆送出」即自動收回,
    // 逾窗後不能再改(否則中心已指派最終場次,受調者仍可改意願重送)。文件未齊者保留開放讓其補完,
    // 由 docs/submit 側對稱收回;中心代送不消耗(開關本就由中心控制)。
    const consumeUnlock = !isAdmin && participant.editUnlocked && participant.docStatus === 'SUBMITTED';
    await prisma.surveyParticipant.update({
      where: { id: participant.id },
      data: { submittedAt: new Date(), ...(consumeUnlock ? { editUnlocked: false } : {}) },
    });

    await writeAuditLog({
      actorId: user.id,
      action: 'SURVEY_WILLINGNESS_SUBMIT',
      entityType: 'SurveyParticipant',
      entityId: participant.id,
      after: consumeUnlock ? { editUnlockConsumed: true } : undefined,
      ...extractRequestMeta(req),
    });

    // P1:回報本次是否消耗掉補填開放,供前端提示正確(否則會說「仍可修改」但實際已鎖)
    return NextResponse.json({ ok: true, unlockConsumed: consumeUnlock });
  } catch (e) {
    return errorResponse(e);
  }
}
