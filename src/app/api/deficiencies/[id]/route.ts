import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { assertDeficiencyAccess } from '@/lib/rbac';
import { errorResponse } from '@/lib/api';
import { DEFICIENCY_ASPECTS, DEFICIENCY_TYPES } from '@/lib/types';
import { PLACEHOLDER_FINDING_RE, isInvalidDeficiencyDescription } from '@/lib/convert-findings';
import { writeAuditLog, extractRequestMeta } from '@/lib/audit-log';

const PatchBody = z.object({
  aspect: z.enum(DEFICIENCY_ASPECTS).optional(),
  type: z.enum(DEFICIENCY_TYPES).optional(),
  description: z
    .string()
    .trim()
    .min(10)
    .refine((s) => !PLACEHOLDER_FINDING_RE.test(s), '缺失描述仍為佔位文字(請補述…),請填寫實際缺失內容')
    .optional(),
  checklistRef: z.string().nullable().optional(),
});

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  try {
    const { user, deficiency } = await assertDeficiencyAccess(params.id);
    if (user.role !== 'SUPER_ADMIN') {
      return NextResponse.json({ error: '僅最高管理員可編輯缺失' }, { status: 403 });
    }
    const body = PatchBody.parse(await req.json());
    // 逃生口(批48 圖6 專審 P2):缺失內容仍為佔位/空白時,即使機關已開始填報,中心仍可補述描述修正——
    // 否則佔位缺失無法審核通過(縱深閘)、無法編修(本閘)、無法刪除 → 週期卡死無法結案。
    const fixingInvalid = isInvalidDeficiencyDescription(deficiency.description) && typeof body.description === 'string';
    if (deficiency.action && deficiency.action.status !== 'PENDING' && !fixingInvalid) {
      return NextResponse.json({ error: '機關已開始填報，不可再編輯缺失內容' }, { status: 400 });
    }

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
    return errorResponse(e);
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
    return errorResponse(e);
  }
}
