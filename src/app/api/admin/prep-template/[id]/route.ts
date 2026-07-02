import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { requireRole } from '@/lib/rbac';
import { deleteFileByKey } from '@/lib/storage';
import { errorResponse } from '@/lib/api';
import { writeAuditLog, extractRequestMeta } from '@/lib/audit-log';

const Patch = z.object({
  title: z.string().min(2).optional(),
  description: z.string().nullable().optional(),
  category: z.enum(['TECH', 'ONSITE', 'CENTER']).optional(),
  required: z.boolean().optional(),
  year: z.number().int().min(2010).max(2100).nullable().optional(), // 西元;null=通用
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
        ...(body.year !== undefined ? { year: body.year } : {}),
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
    // 先取範本檔清單再刪(DB 紀錄由 cascade 刪除,實體檔須另行清理避免磁碟孤兒)
    const files = await prisma.prepTemplateFile.findMany({
      where: { itemId: params.id },
      select: { storageKey: true },
    });
    await prisma.prepTemplateItem.delete({ where: { id: params.id } });
    for (const f of files) {
      try {
        await deleteFileByKey(f.storageKey);
      } catch (err) {
        console.error('[prep-template] 刪除範本實體檔失敗:', (err as Error).message);
      }
    }
    await writeAuditLog({
      actorId: user.id, action: 'PREP_TEMPLATE_ITEM_DELETE', entityType: 'PrepTemplateItem',
      entityId: params.id, ...extractRequestMeta(req),
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
