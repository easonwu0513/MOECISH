import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { requireRole } from '@/lib/rbac';
import { errorResponse } from '@/lib/api';
import { writeAuditLog, extractRequestMeta } from '@/lib/audit-log';

const Patch = z.object({
  title: z.string().min(2).optional(),
  description: z.string().nullable().optional(),
  category: z.enum(['TECH', 'ONSITE', 'CENTER']).optional(),
  required: z.boolean().optional(),
});

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  try {
    const user = await requireRole('SUPER_ADMIN');
    const body = Patch.parse(await req.json());
    const item = await prisma.prepTemplateItem.update({
      where: { id: params.id },
      data: {
        ...(body.title !== undefined ? { title: body.title } : {}),
        ...(body.description !== undefined ? { description: body.description || null } : {}),
        ...(body.category !== undefined ? { category: body.category } : {}),
        ...(body.required !== undefined ? { required: body.required } : {}),
      },
    });
    await writeAuditLog({
      actorId: user.id, action: 'PREP_TEMPLATE_ITEM_UPDATE', entityType: 'PrepTemplateItem',
      entityId: item.id, after: { title: item.title, category: item.category }, ...extractRequestMeta(req),
    });
    return NextResponse.json({ item });
  } catch (e) {
    return errorResponse(e);
  }
}

export async function DELETE(req: Request, { params }: { params: { id: string } }) {
  try {
    const user = await requireRole('SUPER_ADMIN');
    await prisma.prepTemplateItem.delete({ where: { id: params.id } });
    await writeAuditLog({
      actorId: user.id, action: 'PREP_TEMPLATE_ITEM_DELETE', entityType: 'PrepTemplateItem',
      entityId: params.id, ...extractRequestMeta(req),
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
