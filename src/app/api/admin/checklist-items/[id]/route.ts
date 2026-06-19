import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { requireRole } from '@/lib/rbac';
import { errorResponse } from '@/lib/api';
import { writeAuditLog, extractRequestMeta } from '@/lib/audit-log';

const PatchBody = z.object({
  content: z.string().min(5).optional(),
  auditBasis: z.string().nullable().optional(),
  auditFocus: z.string().nullable().optional(),
  expectedEvidence: z.string().nullable().optional(),
});

/** 編輯檢核項目(題文與法規對照;已有作答時仍可改 — 視為勘誤,寫稽核軌跡)。 */
export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  try {
    const user = await requireRole('SUPER_ADMIN');
    const item = await prisma.checklistItem.findUnique({
      where: { id: params.id },
      include: { _count: { select: { responses: true } } },
    });
    if (!item) return NextResponse.json({ error: '項目不存在' }, { status: 404 });

    const body = PatchBody.parse(await req.json());
    const updated = await prisma.checklistItem.update({
      where: { id: item.id },
      data: {
        content: body.content,
        auditBasis: body.auditBasis === undefined ? undefined : body.auditBasis,
        auditFocus: body.auditFocus === undefined ? undefined : body.auditFocus,
        expectedEvidence: body.expectedEvidence === undefined ? undefined : body.expectedEvidence,
      },
    });

    const meta = extractRequestMeta(req);
    await writeAuditLog({
      actorId: user.id,
      action: 'CHECKLIST_ITEM_UPDATE',
      entityType: 'ChecklistItem',
      entityId: item.id,
      before: { content: item.content, hadResponses: item._count.responses },
      after: { content: updated.content },
      ...meta,
    });

    return NextResponse.json({ item: updated });
  } catch (e) {
    return errorResponse(e);
  }
}

/** 刪除檢核項目;已有機關作答則禁止(保護歷史資料)。 */
export async function DELETE(req: Request, { params }: { params: { id: string } }) {
  try {
    const user = await requireRole('SUPER_ADMIN');
    const item = await prisma.checklistItem.findUnique({
      where: { id: params.id },
      include: { _count: { select: { responses: true } } },
    });
    if (!item) return NextResponse.json({ error: '項目不存在' }, { status: 404 });
    if (item._count.responses > 0) {
      return NextResponse.json(
        { error: `已有 ${item._count.responses} 筆機關作答,不可刪除;若要停用請改用年度換版` },
        { status: 400 },
      );
    }

    await prisma.checklistItem.delete({ where: { id: item.id } });

    const meta = extractRequestMeta(req);
    await writeAuditLog({
      actorId: user.id,
      action: 'CHECKLIST_ITEM_DELETE',
      entityType: 'ChecklistItem',
      entityId: item.id,
      before: { itemNo: item.itemNo, content: item.content },
      ...meta,
    });

    return NextResponse.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
