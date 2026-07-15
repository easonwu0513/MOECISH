import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { requireRole } from '@/lib/rbac';
import { errorResponse } from '@/lib/api';
import { writeAuditLog, extractRequestMeta } from '@/lib/audit-log';
import { loadParticipantForAccess } from '@/lib/pre-survey-server';
import { SURVEY_COMMITTEE_TYPES, SURVEY_REPLY_STATUSES, SURVEY_DOC_HANDOVER_STATUSES } from '@/lib/types';

const Body = z.object({
  // 本人或中心皆可改:自己的聯絡資訊
  phone: z.string().trim().max(50).nullable().optional(),
  email: z.string().trim().max(200).nullable().optional(),
  // 僅中心可改的管考欄位(note=中心對受調者的內部管理註記,自助頁不顯示,故不對本人開放)
  note: z.string().trim().max(1000).nullable().optional(),
  committeeType: z.enum(SURVEY_COMMITTEE_TYPES).nullable().optional(),
  replyStatus: z.enum(SURVEY_REPLY_STATUSES).optional(),
  docHandover: z.enum(SURVEY_DOC_HANDOVER_STATUSES).optional(),
  // 僅中心可改:自訂欄位單格值(mockup 改版;value 為空字串=清除該格)
  customValue: z.object({ columnId: z.string().min(1), value: z.string().max(500) }).optional(),
});

/** 解析 customValues JSON;壞資料回空物件。 */
function parseCustomValues(json: string | null): Record<string, string> {
  if (!json) return {};
  try {
    const o = JSON.parse(json);
    return o && typeof o === 'object' && !Array.isArray(o) ? (o as Record<string, string>) : {};
  } catch {
    return {};
  }
}

/**
 * 更新受調人員欄位(批A)。
 *  - 本人(委員/觀察員):限自己的聯絡資訊(phone/email)。
 *  - 中心(SUPER_ADMIN):上列 + 管考欄位(note/committeeType/replyStatus/docHandover)。
 * 授權由 loadParticipantForAccess(中心或本人)把關;管考欄位另擋非中心。
 */
export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  try {
    const { user, participant, isAdmin } = await loadParticipantForAccess(params.id);
    const body = Body.parse(await req.json());

    const adminOnlyTouched =
      body.note !== undefined ||
      body.committeeType !== undefined ||
      body.replyStatus !== undefined ||
      body.docHandover !== undefined ||
      body.customValue !== undefined;
    if (adminOnlyTouched && !isAdmin) {
      return NextResponse.json({ error: '此欄位僅中心可調整' }, { status: 403 });
    }

    const data: Record<string, unknown> = {};
    if (body.phone !== undefined) data.phone = body.phone?.trim() || null;
    if (body.email !== undefined) data.email = body.email?.trim() || null;
    if (isAdmin) {
      if (body.note !== undefined) data.note = body.note?.trim() || null;
      if (body.committeeType !== undefined) {
        // 觀察員無委員細分構面
        data.committeeType = participant.kind === 'MEMBER' ? body.committeeType : null;
      }
      if (body.replyStatus !== undefined) data.replyStatus = body.replyStatus;
      if (body.docHandover !== undefined) data.docHandover = body.docHandover;
    }
    const cv = isAdmin ? body.customValue : undefined; // customValues 為 read-modify-write,另走交易避免遺失更新
    if (Object.keys(data).length === 0 && cv === undefined) {
      return NextResponse.json({ error: '未提供要更新的欄位' }, { status: 400 });
    }

    if (cv !== undefined) {
      // 自訂欄位單格值合併到 customValues JSON blob:兩位中心同時改同一列不同格會 read-modify-write 遺失,
      // 故 Serializable 交易內重讀後合併(PG SSI 撞寫→P2034→409 供前端重試,與全庫並發模式一致)。
      try {
        await prisma.$transaction(
          async (tx) => {
            const cur = await tx.surveyParticipant.findUnique({
              where: { id: participant.id },
              select: { customValues: true },
            });
            const values = parseCustomValues(cur?.customValues ?? null);
            const v = cv.value.trim();
            if (v) values[cv.columnId] = v;
            else delete values[cv.columnId];
            await tx.surveyParticipant.update({
              where: { id: participant.id },
              data: { ...data, customValues: Object.keys(values).length > 0 ? JSON.stringify(values) : null },
            });
          },
          { isolationLevel: 'Serializable' },
        );
      } catch (e) {
        if ((e as { code?: string }).code === 'P2034') {
          return NextResponse.json({ error: '儲存衝突，請稍候重試。' }, { status: 409 });
        }
        throw e;
      }
    } else {
      await prisma.surveyParticipant.update({ where: { id: participant.id }, data });
    }

    await writeAuditLog({
      actorId: user.id,
      action: 'SURVEY_PARTICIPANT_UPDATE',
      entityType: 'SurveyParticipant',
      entityId: participant.id,
      after: { fields: [...Object.keys(data), ...(cv !== undefined ? ['customValues'] : [])], byAdmin: isAdmin },
      ...extractRequestMeta(req),
    });

    return NextResponse.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}

/** 移除受調人員(批A;僅中心)。關聯意願/指派由 onDelete: Cascade 一併清除。 */
export async function DELETE(req: Request, { params }: { params: { id: string } }) {
  try {
    const user = await requireRole('SUPER_ADMIN');
    const existing = await prisma.surveyParticipant.findUnique({ where: { id: params.id }, select: { id: true } });
    if (!existing) return NextResponse.json({ error: '受調人員不存在' }, { status: 404 });

    await prisma.surveyParticipant.delete({ where: { id: params.id } });

    await writeAuditLog({
      actorId: user.id,
      action: 'SURVEY_PARTICIPANT_REMOVE',
      entityType: 'SurveyParticipant',
      entityId: params.id,
      ...extractRequestMeta(req),
    });

    return NextResponse.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
