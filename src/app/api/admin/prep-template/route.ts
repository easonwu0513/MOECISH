import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { requireRole } from '@/lib/rbac';
import { errorResponse } from '@/lib/api';
import { writeAuditLog, extractRequestMeta } from '@/lib/audit-log';

/** 全域標準清單模板:以單一具名模板「標準清單」承載(找不到則建立)。 */
async function defaultTemplateId(): Promise<string> {
  const existing = await prisma.prepTemplate.findFirst({ where: { name: '標準清單' }, select: { id: true } });
  if (existing) return existing.id;
  const created = await prisma.prepTemplate.create({ data: { name: '標準清單' } });
  return created.id;
}

export async function GET() {
  try {
    await requireRole('SUPER_ADMIN');
    const templateId = await defaultTemplateId();
    const items = await prisma.prepTemplateItem.findMany({
      where: { templateId },
      orderBy: { orderIndex: 'asc' },
    });
    return NextResponse.json({ items });
  } catch (e) {
    return errorResponse(e);
  }
}

const Body = z.object({
  title: z.string().min(2),
  description: z.string().optional(),
  category: z.enum(['TECH', 'ONSITE', 'CENTER']).optional(),
  required: z.boolean().optional(),
});

export async function POST(req: Request) {
  try {
    const user = await requireRole('SUPER_ADMIN');
    const body = Body.parse(await req.json());
    const templateId = await defaultTemplateId();
    const max = await prisma.prepTemplateItem.aggregate({ where: { templateId }, _max: { orderIndex: true } });
    const item = await prisma.prepTemplateItem.create({
      data: {
        templateId,
        title: body.title,
        description: body.description || null,
        category: body.category ?? 'ONSITE',
        required: body.required ?? true,
        orderIndex: (max._max.orderIndex ?? -1) + 1,
      },
    });
    await writeAuditLog({
      actorId: user.id, action: 'PREP_TEMPLATE_ITEM_CREATE', entityType: 'PrepTemplateItem',
      entityId: item.id, after: { title: item.title, category: item.category }, ...extractRequestMeta(req),
    });
    return NextResponse.json({ item });
  } catch (e) {
    return errorResponse(e);
  }
}
