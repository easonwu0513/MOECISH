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

/** 刪除題庫版本(連同全部題目);有週期使用中或已有作答則禁止。 */
export async function DELETE(req: Request, { params }: { params: { id: string } }) {
  try {
    const user = await requireRole('SUPER_ADMIN');
    const version = await prisma.checklistVersion.findUnique({
      where: { id: params.id },
      include: { _count: { select: { cycles: true, items: true } } },
    });
    if (!version) return NextResponse.json({ error: '版本不存在' }, { status: 404 });
    if (version._count.cycles > 0) {
      return NextResponse.json(
        { error: `有 ${version._count.cycles} 個稽核週期使用此版本,不可刪除;若不再使用請改「停用」` },
        { status: 400 },
      );
    }
    // 雙重保險:任何題目有作答即禁止(理論上無週期就無作答)
    const responses = await prisma.checklistResponse.count({
      where: { checklistItem: { versionId: version.id } },
    });
    if (responses > 0) {
      return NextResponse.json({ error: '此版本題目已有作答紀錄,不可刪除' }, { status: 400 });
    }

    await prisma.$transaction([
      prisma.checklistItem.deleteMany({ where: { versionId: version.id } }),
      prisma.checklistVersion.delete({ where: { id: version.id } }),
    ]);

    const meta = extractRequestMeta(req);
    await writeAuditLog({
      actorId: user.id,
      action: 'CHECKLIST_VERSION_DELETE',
      entityType: 'ChecklistVersion',
      entityId: version.id,
      before: { name: version.name, year: version.year, items: version._count.items },
      ...meta,
    });

    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof AuthError) return NextResponse.json({ error: e.message }, { status: e.status });
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}
