import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { errorResponse } from '@/lib/api';
import { loadParticipantForAccess } from '@/lib/pre-survey-server';
import { canEditAvailability } from '@/lib/pre-survey-window';
import { SURVEY_TRANSPORT_OPTIONS, SURVEY_DIET_OPTIONS, isValidTransportToken } from '@/lib/types';

const Body = z.object({
  // UAT 圖14:交通(含住宿)改「逐指派場次」填(地點不同交通不同);飲食全場次一致仍存受調者。
  // UAT 圖20:「大眾運輸」以複合 token 帶單選工具(高鐵/火車/客運/其他:簡述),isValidTransportToken 白名單驗證。
  sessionTransport: z
    .object({
      sessionId: z.string().min(1),
      transport: z
        .array(z.string().max(80))
        .max(SURVEY_TRANSPORT_OPTIONS.length + 1)
        .refine((arr) => arr.every(isValidTransportToken), { message: '交通選項格式不正確' }),
    })
    .optional(),
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

    // 逐場次交通:寫入該受調者「該場次的指派列」(不存在=未被指派該場次,擋 crafted request)
    if (body.sessionTransport !== undefined) {
      const st = body.sessionTransport;
      const assignment = await prisma.surveyFinalAssignment.findUnique({
        where: { participantId_sessionId: { participantId: participant.id, sessionId: st.sessionId } },
        include: { session: { select: { needsTravel: true } } },
      });
      if (!assignment) {
        return NextResponse.json({ error: '您未被指派此場次，無法填寫其差旅資訊。' }, { status: 400 });
      }
      if (!assignment.session.needsTravel) {
        return NextResponse.json({ error: '此場次為線上或無需差旅調查。' }, { status: 400 });
      }
      await prisma.surveyFinalAssignment.update({
        where: { id: assignment.id },
        data: { transport: JSON.stringify(Array.from(new Set(st.transport))) },
      });
    }

    const data: Record<string, unknown> = {};
    if (body.diet !== undefined) data.diet = JSON.stringify(Array.from(new Set(body.diet)));
    if (body.travelNote !== undefined) data.travelNote = body.travelNote?.trim() || null;
    if (body.sessionTransport === undefined && Object.keys(data).length === 0) {
      return NextResponse.json({ error: '未提供要更新的欄位' }, { status: 400 });
    }
    if (Object.keys(data).length > 0) {
      await prisma.surveyParticipant.update({ where: { id: participant.id }, data });
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
