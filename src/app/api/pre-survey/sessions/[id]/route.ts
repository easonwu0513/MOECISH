import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { requireRole } from '@/lib/rbac';
import { errorResponse } from '@/lib/api';
import { writeAuditLog, extractRequestMeta } from '@/lib/audit-log';
import { assertSurveyYearWritable } from '@/lib/pre-survey-server';

const Body = z.object({
  name: z.string().trim().min(1).max(100).optional(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  isRequired: z.boolean().optional(),
  remark: z.string().trim().max(500).nullable().optional(),
  targetMemberCount: z.number().int().min(0).max(999).optional(),
  targetObserverCount: z.number().int().min(0).max(999).optional(),
  anonymizeForMember: z.boolean().optional(),
  anonymizeForObserver: z.boolean().optional(),
  sharedWithObserver: z.boolean().optional(),
  needsTravel: z.boolean().optional(), // UAT 圖14:此場次是否需第二階段差旅
});

/** 編輯年度場次(批A;僅中心)。 */
export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  try {
    const user = await requireRole('SUPER_ADMIN');
    const body = Body.parse(await req.json());

    const existing = await prisma.surveySession.findUnique({
      where: { id: params.id },
      select: { id: true, sourceCycleId: true, year: true },
    });
    if (!existing) return NextResponse.json({ error: '場次不存在' }, { status: 404 });
    assertSurveyYearWritable(existing.year); // UAT 圖57:歷年資料唯讀

    // UAT 圖13(伺服器端強制):由稽核週期帶入的場次,日期鎖定——僅隨該週期實地稽核日連動
    if (body.date !== undefined && existing.sourceCycleId) {
      return NextResponse.json(
        { error: '此場次由稽核週期帶入，日期請至該稽核週期修改「實地稽核日期」，此處將自動連動。' },
        { status: 400 },
      );
    }

    const data: Record<string, unknown> = {};
    if (body.name !== undefined) data.name = body.name;
    if (body.date !== undefined) data.date = body.date ? new Date(`${body.date}T00:00:00+08:00`) : null;
    if (body.isRequired !== undefined) data.isRequired = body.isRequired;
    if (body.remark !== undefined) data.remark = body.remark?.trim() || null;
    if (body.targetMemberCount !== undefined) data.targetMemberCount = body.targetMemberCount;
    if (body.targetObserverCount !== undefined) data.targetObserverCount = body.targetObserverCount;
    if (body.anonymizeForMember !== undefined) data.anonymizeForMember = body.anonymizeForMember;
    if (body.anonymizeForObserver !== undefined) data.anonymizeForObserver = body.anonymizeForObserver;
    if (body.sharedWithObserver !== undefined) data.sharedWithObserver = body.sharedWithObserver;
    if (body.needsTravel !== undefined) data.needsTravel = body.needsTravel; // UAT 圖14
    if (Object.keys(data).length === 0) {
      return NextResponse.json({ error: '未提供要更新的欄位' }, { status: 400 });
    }

    await prisma.surveySession.update({ where: { id: params.id }, data });

    await writeAuditLog({
      actorId: user.id,
      action: 'SURVEY_SESSION_UPDATE',
      entityType: 'SurveySession',
      entityId: params.id,
      after: data,
      ...extractRequestMeta(req),
    });

    return NextResponse.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}

/** 刪除年度場次(批A;僅中心)。關聯意願/指派由 schema onDelete: Cascade 一併清除。 */
export async function DELETE(req: Request, { params }: { params: { id: string } }) {
  try {
    const user = await requireRole('SUPER_ADMIN');
    const existing = await prisma.surveySession.findUnique({
      where: { id: params.id },
      select: { id: true, isBriefing: true, year: true },
    });
    if (!existing) return NextResponse.json({ error: '場次不存在' }, { status: 404 });
    assertSurveyYearWritable(existing.year); // UAT 圖57:歷年資料唯讀
    // UAT 圖14:受稽機關說明會為年度必備場次,不可刪除(名稱/日期可編輯)
    if (existing.isBriefing) {
      return NextResponse.json({ error: '「受稽機關說明會」為年度必備場次，不可刪除；可編輯其名稱與時間。' }, { status: 400 });
    }

    await prisma.surveySession.delete({ where: { id: params.id } });

    await writeAuditLog({
      actorId: user.id,
      action: 'SURVEY_SESSION_DELETE',
      entityType: 'SurveySession',
      entityId: params.id,
      ...extractRequestMeta(req),
    });

    return NextResponse.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
