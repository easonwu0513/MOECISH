import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { requireRole } from '@/lib/rbac';
import { errorResponse } from '@/lib/api';
import { writeAuditLog, extractRequestMeta } from '@/lib/audit-log';
import { loadParticipantForAccess } from '@/lib/pre-survey-server';
import { deleteFileByKey } from '@/lib/storage';
import { SURVEY_COMMITTEE_TYPES, SURVEY_REPLY_STATUSES, SURVEY_DOC_HANDOVER_STATUSES } from '@/lib/types';

const Body = z.object({
  // 本人或中心皆可改:自己的聯絡資訊(主要 + 次要)
  phone: z.string().trim().max(50).nullable().optional(),
  email: z.string().trim().max(200).nullable().optional(),
  phone2: z.string().trim().max(50).nullable().optional(),
  email2: z.string().trim().max(200).nullable().optional(),
  // 代理聯絡人(UAT:勾選「有代理聯絡人」後填;取消勾選=送 null 清除)
  proxyName: z.string().trim().max(100).nullable().optional(),
  proxyEmail: z.string().trim().max(200).nullable().optional(),
  proxyPhone: z.string().trim().max(50).nullable().optional(),
  // 僅中心可改的管考欄位(note=中心對受調者的內部管理註記,自助頁不顯示,故不對本人開放)
  note: z.string().trim().max(1000).nullable().optional(),
  committeeType: z.enum(SURVEY_COMMITTEE_TYPES).nullable().optional(),
  replyStatus: z.enum(SURVEY_REPLY_STATUSES).optional(),
  docHandover: z.enum(SURVEY_DOC_HANDOVER_STATUSES).optional(),
  // UAT:中心對此人「開放補填/變更意願」開關(逾填報時窗仍可編修意願);僅中心可改。
  editUnlocked: z.boolean().optional(),
  // 自訂欄位單格值(mockup 改版;value 為空字串=清除該格)。中心可改任一欄;
  // 受調者本人僅限已開放填寫(selfEditable)的欄位(於下方 PATCH 內把關)。
  customValue: z.object({ columnId: z.string().min(1), value: z.string().max(500) }).optional(),
  // UAT 圖24 安全鎖:聯絡資訊為受調者本人填報結果,中心代改必附變動原因(進稽核軌跡);本人自改不需
  reason: z.string().trim().max(500).optional(),
});

/** 聯絡資訊欄組(UAT 圖24:中心改動需原因解鎖) */
const CONTACT_FIELDS = ['phone', 'email', 'phone2', 'email2', 'proxyName', 'proxyEmail', 'proxyPhone'] as const;

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
 *  - 本人(委員/觀察員):限自己的聯絡資訊(phone/email)+ 中心已開放填寫(selfEditable)的自訂欄位值。
 *  - 中心(SUPER_ADMIN):上列 + 管考欄位(note/committeeType/replyStatus/docHandover)+ 任一自訂欄位值。
 * 授權由 loadParticipantForAccess(中心或本人)把關;管考欄位另擋非中心;自訂欄位本人另擋非 selfEditable。
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
      body.editUnlocked !== undefined;
    if (adminOnlyTouched && !isAdmin) {
      return NextResponse.json({ error: '此欄位僅中心可調整' }, { status: 403 });
    }

    // #5:自訂欄位單格值——本人只能操作自己的 participant(已由 loadParticipantForAccess 把關);
    // 此處再擋欄位層級越權:本人僅可改「本年度、已開放受調者填寫(selfEditable)」的欄位。
    if (body.customValue !== undefined && !isAdmin) {
      const col = await prisma.surveyCustomColumn.findUnique({
        where: { id: body.customValue.columnId },
        select: { year: true, selfEditable: true },
      });
      if (!col || col.year !== participant.year || !col.selfEditable) {
        return NextResponse.json({ error: '此欄位未開放您填寫' }, { status: 403 });
      }
    }

    // UAT 圖24 安全鎖(伺服器端強制,防繞過前端):中心修改聯絡資訊欄組必附變動原因
    const contactTouched = CONTACT_FIELDS.some((f) => body[f] !== undefined);
    if (isAdmin && contactTouched && !body.reason) {
      return NextResponse.json({ error: '中心修改受調者聯絡資訊須填寫變動原因（解鎖修改）' }, { status: 400 });
    }

    // UAT 圖21:主要聯絡方式必填——不允許將主要信箱/電話清為空(伺服器端強制)
    if (body.email !== undefined && !body.email?.trim()) {
      return NextResponse.json({ error: '主要電子郵件為必填，不可清空。' }, { status: 400 });
    }
    if (body.phone !== undefined && !body.phone?.trim()) {
      return NextResponse.json({ error: '主要聯絡電話為必填，不可清空。' }, { status: 400 });
    }

    const data: Record<string, unknown> = {};
    if (body.phone !== undefined) data.phone = body.phone?.trim() || null;
    if (body.email !== undefined) data.email = body.email?.trim() || null;
    if (body.phone2 !== undefined) data.phone2 = body.phone2?.trim() || null;
    if (body.email2 !== undefined) data.email2 = body.email2?.trim() || null;
    if (body.proxyName !== undefined) data.proxyName = body.proxyName?.trim() || null;
    if (body.proxyEmail !== undefined) data.proxyEmail = body.proxyEmail?.trim() || null;
    if (body.proxyPhone !== undefined) data.proxyPhone = body.proxyPhone?.trim() || null;
    if (isAdmin) {
      if (body.note !== undefined) data.note = body.note?.trim() || null;
      if (body.committeeType !== undefined) {
        // 觀察員無委員細分構面
        data.committeeType = participant.kind === 'MEMBER' ? body.committeeType : null;
      }
      if (body.replyStatus !== undefined) data.replyStatus = body.replyStatus;
      if (body.docHandover !== undefined) data.docHandover = body.docHandover;
      if (body.editUnlocked !== undefined) data.editUnlocked = body.editUnlocked;
    }
    const cv = body.customValue; // 中心或(通過上方欄位閘的)本人;customValues 為 read-modify-write,另走交易避免遺失更新
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
      after: {
        fields: [...Object.keys(data), ...(cv !== undefined ? ['customValues'] : [])],
        byAdmin: isAdmin,
        // UAT 圖24:中心改聯絡欄的變動原因留痕
        ...(isAdmin && contactTouched && body.reason ? { reason: body.reason } : {}),
      },
      ...extractRequestMeta(req),
    });

    return NextResponse.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}

/**
 * 移除受調人員(批A;僅中心)。關聯意願/指派由 onDelete: Cascade 一併清除。
 * 個資清理:Evidence 為多型關聯(targetType/targetId)無 FK/cascade,不清會遺留 CV/切結書/舊版經歷
 * 等敏感個資於磁碟與懸空 DB 列(違個資法「刪除即清除」)——於同交易刪 DB 列,交易成功後再刪實體檔。
 */
export async function DELETE(req: Request, { params }: { params: { id: string } }) {
  try {
    const user = await requireRole('SUPER_ADMIN');
    const existing = await prisma.surveyParticipant.findUnique({ where: { id: params.id }, select: { id: true } });
    if (!existing) return NextResponse.json({ error: '受調人員不存在' }, { status: 404 });

    const docs = await prisma.evidence.findMany({
      where: { targetType: { in: ['SURVEY_CV', 'SURVEY_NDA', 'SURVEY_CV_PRIOR'] }, targetId: params.id },
      select: { id: true, storageKey: true },
    });

    await prisma.$transaction(async (tx) => {
      if (docs.length) await tx.evidence.deleteMany({ where: { id: { in: docs.map((d) => d.id) } } });
      await tx.surveyParticipant.delete({ where: { id: params.id } });
    });
    // 交易成功(participant 與 Evidence 列已刪)後才刪實體檔;失敗僅留孤兒檔(無資料不一致,比照 docs 上傳)。
    for (const d of docs) await deleteFileByKey(d.storageKey).catch(() => {});

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
