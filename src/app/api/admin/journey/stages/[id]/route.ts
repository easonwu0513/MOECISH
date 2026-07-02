import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { requireRole } from '@/lib/rbac';
import { errorResponse } from '@/lib/api';
import { writeAuditLog, extractRequestMeta } from '@/lib/audit-log';

// 日期字串(yyyy-mm-dd 或 ISO;null=清除)。開始/截止供 PROGRAMME 年度 SOP 排程,CYCLE 不使用(編輯器不顯示)
const DateStr = z.string().refine((v) => !Number.isNaN(Date.parse(v)), '日期格式不正確').nullable().optional();

const Patch = z.object({
  title: z.string().min(1).max(100).optional(),
  summary: z.string().max(300).nullable().optional(),
  stageKey: z.string().min(1).max(40).optional(),
  orderIndex: z.number().int().optional(),
  startDate: DateStr,
  dueDate: DateStr,
});

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  try {
    const user = await requireRole('SUPER_ADMIN');
    const body = Patch.parse(await req.json());
    const stage = await prisma.journeyStage.update({
      where: { id: params.id },
      data: {
        ...(body.title !== undefined ? { title: body.title } : {}),
        ...(body.summary !== undefined ? { summary: body.summary || null } : {}),
        ...(body.stageKey !== undefined ? { stageKey: body.stageKey } : {}),
        ...(body.orderIndex !== undefined ? { orderIndex: body.orderIndex } : {}),
        ...(body.startDate !== undefined ? { startDate: body.startDate ? new Date(body.startDate) : null } : {}),
        ...(body.dueDate !== undefined ? { dueDate: body.dueDate ? new Date(body.dueDate) : null } : {}),
      },
    });
    await writeAuditLog({
      actorId: user.id, action: 'JOURNEY_STAGE_UPDATE', entityType: 'JourneyStage',
      entityId: stage.id, after: { title: stage.title }, ...extractRequestMeta(req),
    });
    return NextResponse.json({ stage });
  } catch (e) {
    return errorResponse(e);
  }
}

/** 刪除階段（連帶 items / progress 由 onDelete: Cascade 處理）。 */
export async function DELETE(req: Request, { params }: { params: { id: string } }) {
  try {
    const user = await requireRole('SUPER_ADMIN');
    await prisma.journeyStage.delete({ where: { id: params.id } });
    await writeAuditLog({
      actorId: user.id, action: 'JOURNEY_STAGE_DELETE', entityType: 'JourneyStage',
      entityId: params.id, ...extractRequestMeta(req),
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
