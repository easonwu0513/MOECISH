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
const PatchBody = z.object({ id: z.string().min(1), title: z.string().trim().min(1).max(60) });
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

/** 重新命名自訂欄位。 */
export async function PATCH(req: Request) {
  try {
    const user = await requireRole('SUPER_ADMIN');
    const { id, title } = PatchBody.parse(await req.json());
    const existing = await prisma.surveyCustomColumn.findUnique({ where: { id }, select: { id: true } });
    if (!existing) return NextResponse.json({ error: '欄位不存在' }, { status: 404 });
    await prisma.surveyCustomColumn.update({ where: { id }, data: { title } });
    await writeAuditLog({
      actorId: user.id,
      action: 'SURVEY_COLUMN_RENAME',
      entityType: 'SurveyCustomColumn',
      entityId: id,
      after: { title },
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
