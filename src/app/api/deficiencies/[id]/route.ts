import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { assertDeficiencyAccess, AuthError } from '@/lib/rbac';
import { DEFICIENCY_ASPECTS, DEFICIENCY_TYPES } from '@/lib/types';
import { writeAuditLog, extractRequestMeta } from '@/lib/audit-log';

const PatchBody = z.object({
  aspect: z.enum(DEFICIENCY_ASPECTS).optional(),
  type: z.enum(DEFICIENCY_TYPES).optional(),
  description: z.string().min(10).optional(),
  checklistRef: z.string().nullable().optional(),
});

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  try {
    const { user, deficiency } = await assertDeficiencyAccess(params.id);
    if (user.role !== 'SUPER_ADMIN') {
      return NextResponse.json({ error: '僅最高管理員可編輯缺失' }, { status: 403 });
    }
    if (deficiency.action && deficiency.action.status !== 'PENDING') {
      return NextResponse.json({ error: '機關已開始填報，不可再編輯缺失內容' }, { status: 400 });
    }
    const body = PatchBody.parse(await req.json());

    const updated = await prisma.deficiency.update({
      where: { id: deficiency.id },
      data: {
        aspect: body.aspect,
        type: body.type,
        description: body.description,
        checklistRef: body.checklistRef === undefined ? undefined : body.checklistRef,
      },
    });

    const meta = extractRequestMeta(req);
    await writeAuditLog({
      actorId: user.id,
      action: 'DEFICIENCY_UPDATE',
      entityType: 'Deficiency',
      entityId: deficiency.id,
      before: { description: deficiency.description },
      after: { description: updated.description },
      ...meta,
    });

    return NextResponse.json({ item: updated });
  } catch (e) {
    if (e instanceof AuthError) return NextResponse.json({ error: e.message }, { status: e.status });
    if (e instanceof z.ZodError) return NextResponse.json({ error: e.errors[0]?.message ?? '輸入有誤' }, { status: 400 });
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}

export async function DELETE(req: Request, { params }: { params: { id: string } }) {
  try {
    const { user, deficiency } = await assertDeficiencyAccess(params.id);
    if (user.role !== 'SUPER_ADMIN') {
      return NextResponse.json({ error: '僅最高管理員可刪除缺失' }, { status: 403 });
    }
    if (deficiency.action && deficiency.action.status !== 'PENDING') {
      return NextResponse.json({ error: '機關已開始填報，不可刪除' }, { status: 400 });
    }

    await prisma.$transaction([
      prisma.reviewRecord.deleteMany({ where: { actionId: deficiency.action?.id ?? '' } }),
      prisma.correctiveAction.deleteMany({ where: { deficiencyId: deficiency.id } }),
      prisma.deficiency.delete({ where: { id: deficiency.id } }),
    ]);

    const meta = extractRequestMeta(req);
    await writeAuditLog({
      actorId: user.id,
      action: 'DEFICIENCY_DELETE',
      entityType: 'Deficiency',
      entityId: deficiency.id,
      before: { description: deficiency.description },
      ...meta,
    });

    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof AuthError) return NextResponse.json({ error: e.message }, { status: e.status });
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}
