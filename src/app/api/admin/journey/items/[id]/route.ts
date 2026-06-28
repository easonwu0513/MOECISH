import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { requireRole } from '@/lib/rbac';
import { errorResponse } from '@/lib/api';
import { writeAuditLog, extractRequestMeta } from '@/lib/audit-log';

const Patch = z.object({
  title: z.string().min(1).max(200).optional(),
  hint: z.string().max(500).nullable().optional(),
  role: z.enum(['SUPER_ADMIN', 'ORG_ADMIN', 'AUDITOR']).nullable().optional(),
  orderIndex: z.number().int().optional(),
});

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  try {
    const user = await requireRole('SUPER_ADMIN');
    const body = Patch.parse(await req.json());
    const item = await prisma.journeyItem.update({
      where: { id: params.id },
      data: {
        ...(body.title !== undefined ? { title: body.title } : {}),
        ...(body.hint !== undefined ? { hint: body.hint || null } : {}),
        ...(body.role !== undefined ? { role: body.role } : {}),
        ...(body.orderIndex !== undefined ? { orderIndex: body.orderIndex } : {}),
      },
    });
    await writeAuditLog({
      actorId: user.id, action: 'JOURNEY_ITEM_UPDATE', entityType: 'JourneyItem',
      entityId: item.id, after: { title: item.title, role: item.role }, ...extractRequestMeta(req),
    });
    return NextResponse.json({ item });
  } catch (e) {
    return errorResponse(e);
  }
}

/** 刪除項目（連帶 progress 由 onDelete: Cascade 處理）。 */
export async function DELETE(req: Request, { params }: { params: { id: string } }) {
  try {
    const user = await requireRole('SUPER_ADMIN');
    await prisma.journeyItem.delete({ where: { id: params.id } });
    await writeAuditLog({
      actorId: user.id, action: 'JOURNEY_ITEM_DELETE', entityType: 'JourneyItem',
      entityId: params.id, ...extractRequestMeta(req),
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
