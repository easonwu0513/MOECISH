import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { requireRole, AuthError } from '@/lib/rbac';
import { errorResponse } from '@/lib/api';
import { writeAuditLog, extractRequestMeta } from '@/lib/audit-log';

const Body = z.object({
  stageId: z.string().min(1),
  title: z.string().min(1).max(200),
  hint: z.string().max(500).nullable().optional(),
  role: z.enum(['SUPER_ADMIN', 'ORG_ADMIN', 'AUDITOR']).nullable().optional(),
});

/** 後台：在某階段新增一個項目（接到最後）。 */
export async function POST(req: Request) {
  try {
    const user = await requireRole('SUPER_ADMIN');
    const body = Body.parse(await req.json());

    const stage = await prisma.journeyStage.findUnique({ where: { id: body.stageId }, select: { id: true } });
    if (!stage) throw new AuthError(404, '階段不存在');

    const last = await prisma.journeyItem.findFirst({
      where: { stageId: body.stageId },
      orderBy: { orderIndex: 'desc' },
      select: { orderIndex: true },
    });
    const item = await prisma.journeyItem.create({
      data: {
        stageId: body.stageId,
        title: body.title,
        hint: body.hint ?? null,
        role: body.role ?? null,
        orderIndex: (last?.orderIndex ?? -1) + 1,
      },
    });

    await writeAuditLog({
      actorId: user.id, action: 'JOURNEY_ITEM_CREATE', entityType: 'JourneyItem',
      entityId: item.id, after: { title: item.title, role: item.role }, ...extractRequestMeta(req),
    });
    return NextResponse.json({ item });
  } catch (e) {
    return errorResponse(e);
  }
}
