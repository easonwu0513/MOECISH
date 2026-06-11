import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { requireRole, AuthError } from '@/lib/rbac';
import { writeAuditLog, extractRequestMeta } from '@/lib/audit-log';

const PatchBody = z.object({
  isActive: z.boolean().optional(),
  name: z.string().min(2).optional(),
});

/** 題庫版本:啟用/停用(影響開立週期時可選清單)、改名。 */
export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  try {
    const user = await requireRole('SUPER_ADMIN');
    const version = await prisma.checklistVersion.findUnique({ where: { id: params.id } });
    if (!version) return NextResponse.json({ error: '版本不存在' }, { status: 404 });

    const body = PatchBody.parse(await req.json());
    const updated = await prisma.checklistVersion.update({
      where: { id: version.id },
      data: {
        isActive: body.isActive,
        name: body.name,
        publishedAt: body.isActive && !version.publishedAt ? new Date() : undefined,
      },
    });

    const meta = extractRequestMeta(req);
    await writeAuditLog({
      actorId: user.id,
      action: 'CHECKLIST_VERSION_UPDATE',
      entityType: 'ChecklistVersion',
      entityId: version.id,
      before: { isActive: version.isActive, name: version.name },
      after: { isActive: updated.isActive, name: updated.name },
      ...meta,
    });

    return NextResponse.json({ item: updated });
  } catch (e) {
    if (e instanceof AuthError) return NextResponse.json({ error: e.message }, { status: e.status });
    if (e instanceof z.ZodError) return NextResponse.json({ error: e.errors[0]?.message ?? '輸入有誤' }, { status: 400 });
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}
