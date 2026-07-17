import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { errorResponse } from '@/lib/api';
import { loadParticipantForAccess } from '@/lib/pre-survey-server';
import { canEditAvailability } from '@/lib/pre-survey-window';
import { SURVEY_TRANSPORT_OPTIONS, SURVEY_DIET_OPTIONS } from '@/lib/types';

const Body = z.object({
  transport: z.array(z.enum(SURVEY_TRANSPORT_OPTIONS)).max(SURVEY_TRANSPORT_OPTIONS.length).optional(),
  diet: z.array(z.enum(SURVEY_DIET_OPTIONS)).max(SURVEY_DIET_OPTIONS.length).optional(),
  travelNote: z.string().trim().max(1000).nullable().optional(),
});

/**
 * 差旅二階(批B):受調人員填交通/飲食/差旅備註。本人或中心可填。
 * ⚠️ 解鎖條件=已被指派至少一個最終場次(SurveyFinalAssignment ≥1);未指派則二階鎖定回 400。
 * transport/diet 去重後存 JSON 字串。
 */
export async function PUT(req: Request, { params }: { params: { id: string } }) {
  try {
    const { participant, isAdmin } = await loadParticipantForAccess(params.id);
    const body = Body.parse(await req.json());

    const assigned = await prisma.surveyFinalAssignment.count({ where: { participantId: participant.id } });
    if (assigned === 0) {
      return NextResponse.json({ error: '尚未被指派最終場次，差旅與飲食調查暫未開放填寫。' }, { status: 400 });
    }

    // UAT 圖7 第二時窗(伺服器端強制,防繞過前端):本人限差旅調查區間內填寫;
    // 中心代填不受限;editUnlocked(中心開放補填)豁免——重用意願時窗同一組純函式。
    if (!isAdmin) {
      const win = await prisma.surveyFillWindow.findUnique({
        where: { year: participant.year },
        select: { travelOpenAt: true, travelCloseAt: true },
      });
      const travelWin = win ? { openAt: win.travelOpenAt, closeAt: win.travelCloseAt } : null;
      if (!canEditAvailability(travelWin, participant.editUnlocked, new Date())) {
        return NextResponse.json(
          { error: '差旅調查未在開放時間內；如需填寫或變更，請聯絡中心開放。' },
          { status: 403 },
        );
      }
    }

    const data: Record<string, unknown> = {};
    if (body.transport !== undefined) data.transport = JSON.stringify(Array.from(new Set(body.transport)));
    if (body.diet !== undefined) data.diet = JSON.stringify(Array.from(new Set(body.diet)));
    if (body.travelNote !== undefined) data.travelNote = body.travelNote?.trim() || null;
    if (Object.keys(data).length === 0) {
      return NextResponse.json({ error: '未提供要更新的欄位' }, { status: 400 });
    }

    await prisma.surveyParticipant.update({ where: { id: participant.id }, data });

    return NextResponse.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
