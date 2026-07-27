import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { errorResponse } from '@/lib/api';
import { loadParticipantForAccess, assertSurveyYearWritable } from '@/lib/pre-survey-server';
import { canEditAvailability, stage2WindowFor, YEAR_WINDOWS_SELECT } from '@/lib/pre-survey-window';
import { SURVEY_DIET_OPTIONS, isValidTransportToken } from '@/lib/types';

const Body = z.object({
  // UAT 圖14:交通(含住宿)改「逐指派場次」填(地點不同交通不同);飲食全場次一致仍存受調者。
  // UAT 圖20:「大眾運輸」以複合 token 帶單選工具(高鐵/火車/客運/其他:簡述),isValidTransportToken 白名單驗證。
  sessionTransport: z
    .object({
      sessionId: z.string().min(1),
      // UAT 圖64:大眾運輸工具可複選(轉乘情境)→ 上限放寬(基本選項+汽車複合+各運輸工具 token)
      transport: z
        .array(z.string().max(80))
        .max(10)
        .refine((arr) => arr.every(isValidTransportToken), { message: '交通選項格式不正確' }),
    })
    .optional(),
  // UAT 圖64:葷/素互斥(前端自動切換,此為防繞過硬擋)
  diet: z
    .array(z.enum(SURVEY_DIET_OPTIONS))
    .max(SURVEY_DIET_OPTIONS.length)
    .refine((arr) => !(arr.includes('葷') && arr.includes('素')), { message: '飲食需求中葷與素僅能擇一' })
    .optional(),
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
    assertSurveyYearWritable(participant.year); // UAT 圖57:歷年資料唯讀
    const body = Body.parse(await req.json());

    const assigned = await prisma.surveyFinalAssignment.count({ where: { participantId: participant.id } });
    if (assigned === 0) {
      return NextResponse.json({ error: '尚未被指派最終場次，差旅與飲食調查暫未開放填寫。' }, { status: 400 });
    }

    // UAT 圖7 第二時窗(伺服器端強制,防繞過前端):本人限差旅調查區間內填寫;
    // 中心代填不受限;圖55:二階豁免改讀 travelEditUnlocked(與一階 editUnlocked 分離,互不連動)。
    if (!isAdmin) {
      const win = await prisma.surveyFillWindow.findUnique({
        where: { year: participant.year },
        select: YEAR_WINDOWS_SELECT,
      });
      if (!canEditAvailability(stage2WindowFor(win, participant.kind), participant.travelEditUnlocked, new Date())) {
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

    // UAT 圖55:二階補填開放為一次性——本人把「需差旅場次交通+飲食」都填齊即自動收回
    // (與一階 editUnlocked 於圖52 的消耗語意對稱;中心代填不消耗)。
    if (!isAdmin && participant.travelEditUnlocked) {
      const [assignments, fresh] = await Promise.all([
        prisma.surveyFinalAssignment.findMany({
          where: { participantId: participant.id },
          select: { transport: true, session: { select: { needsTravel: true } } },
        }),
        prisma.surveyParticipant.findUnique({ where: { id: participant.id }, select: { diet: true } }),
      ]);
      const parseLen = (json: string | null) => {
        try {
          const a = JSON.parse(json ?? '[]');
          return Array.isArray(a) ? a.length : 0;
        } catch {
          return 0;
        }
      };
      const travelDone = assignments.filter((a) => a.session.needsTravel).every((a) => parseLen(a.transport) > 0);
      const dietDone = parseLen(fresh?.diet ?? null) > 0;
      if (travelDone && dietDone) {
        await prisma.surveyParticipant.update({ where: { id: participant.id }, data: { travelEditUnlocked: false } });
      }
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
