import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { requireRole } from '@/lib/rbac';
import { errorResponse } from '@/lib/api';
import { writeAuditLog, extractRequestMeta } from '@/lib/audit-log';

/**
 * 管考表自訂欄位 CRUD(mockup 改版;僅中心)。欄位為年度制;其「值」存於 SurveyParticipant.customValues JSON。
 * 刪欄不連動清值(殘鍵渲染/匯出時忽略,無害)。
 */

const CreateBody = z.object({
  year: z.number().int().min(2000).max(2200),
  title: z.string().trim().min(1).max(60),
});
const PatchBody = z.object({
  id: z.string().min(1),
  title: z.string().trim().min(1).max(60).optional(),
  selfEditable: z.boolean().optional(), // 是否開放受調者於自助頁自行填寫
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, '日期格式須為 YYYY-MM-DD').nullable().optional(), // 受調者填報到期日;null=清除
});
const DeleteBody = z.object({ id: z.string().min(1) });

/** 新增自訂欄位;orderIndex 續接該年度末位。 */
export async function POST(req: Request) {
  try {
    const user = await requireRole('SUPER_ADMIN');
    const { year, title } = CreateBody.parse(await req.json());
    const last = await prisma.surveyCustomColumn.findFirst({
      where: { year },
      orderBy: { orderIndex: 'desc' },
      select: { orderIndex: true },
    });
    const col = await prisma.surveyCustomColumn.create({
      data: { year, title, orderIndex: (last?.orderIndex ?? -1) + 1, createdById: user.id },
      select: { id: true },
    });
    await writeAuditLog({
      actorId: user.id,
      action: 'SURVEY_COLUMN_CREATE',
      entityType: 'SurveyCustomColumn',
      entityId: col.id,
      after: { year, title },
      ...extractRequestMeta(req),
    });
    return NextResponse.json({ id: col.id });
  } catch (e) {
    return errorResponse(e);
  }
}

/** 更新自訂欄位:改名 / 開放受調者填寫(selfEditable) / 設定到期日(dueDate)。 */
export async function PATCH(req: Request) {
  try {
    const user = await requireRole('SUPER_ADMIN');
    const body = PatchBody.parse(await req.json());
    const existing = await prisma.surveyCustomColumn.findUnique({ where: { id: body.id }, select: { id: true } });
    if (!existing) return NextResponse.json({ error: '欄位不存在' }, { status: 404 });

    const data: Record<string, unknown> = {};
    if (body.title !== undefined) data.title = body.title;
    if (body.selfEditable !== undefined) data.selfEditable = body.selfEditable;
    // 到期日沿用場次的台北 00:00 存法(讀取端以 +8 時區還原日期);null=清除
    if (body.dueDate !== undefined) data.dueDate = body.dueDate ? new Date(`${body.dueDate}T00:00:00+08:00`) : null;
    if (Object.keys(data).length === 0) {
      return NextResponse.json({ error: '未提供要更新的欄位' }, { status: 400 });
    }
    await prisma.surveyCustomColumn.update({ where: { id: body.id }, data });

    await writeAuditLog({
      actorId: user.id,
      action: 'SURVEY_COLUMN_UPDATE',
      entityType: 'SurveyCustomColumn',
      entityId: body.id,
      after: { title: body.title, selfEditable: body.selfEditable, dueDate: body.dueDate },
      ...extractRequestMeta(req),
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}

/** 刪除自訂欄位(不連動清 SurveyParticipant.customValues 殘鍵)。 */
export async function DELETE(req: Request) {
  try {
    const user = await requireRole('SUPER_ADMIN');
    const { id } = DeleteBody.parse(await req.json());
    const existing = await prisma.surveyCustomColumn.findUnique({ where: { id }, select: { id: true } });
    if (!existing) return NextResponse.json({ error: '欄位不存在' }, { status: 404 });
    await prisma.surveyCustomColumn.delete({ where: { id } });
    await writeAuditLog({
      actorId: user.id,
      action: 'SURVEY_COLUMN_DELETE',
      entityType: 'SurveyCustomColumn',
      entityId: id,
      ...extractRequestMeta(req),
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
