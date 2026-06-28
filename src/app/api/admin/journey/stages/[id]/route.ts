import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { requireRole } from '@/lib/rbac';
import { errorResponse } from '@/lib/api';
import { writeAuditLog, extractRequestMeta } from '@/lib/audit-log';

const Patch = z.object({
  title: z.string().min(1).max(100).optional(),
  summary: z.string().max(300).nullable().optional(),
  stageKey: z.string().min(1).max(40).optional(),
  orderIndex: z.number().int().optional(),
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
