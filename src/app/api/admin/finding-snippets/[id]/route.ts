import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { requireRole } from '@/lib/rbac';
import { errorResponse } from '@/lib/api';
import { writeAuditLog, extractRequestMeta } from '@/lib/audit-log';

const ASPECTS = ['', 'STRATEGY', 'MANAGEMENT', 'TECHNICAL'] as const;
const KINDS = ['', 'COMPLIANCE', 'IMPROVE', 'SUGGEST'] as const;

const PatchBody = z.object({
  aspect: z.enum(ASPECTS).optional(),
  kind: z.enum(KINDS).optional(),
  text: z.string().trim().min(1, '內容不可空白').max(2000).optional(),
  orderIndex: z.number().int().optional(),
});

/** 編輯稽核發現片語;僅最高管理員。 */
export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  try {
    const user = await requireRole('SUPER_ADMIN');
    const body = PatchBody.parse(await req.json());
    const updated = await prisma.findingSnippet.update({
      where: { id: params.id },
      data: {
        aspect: body.aspect,
        kind: body.kind,
        text: body.text,
        orderIndex: body.orderIndex,
      },
    });
    await writeAuditLog({
      actorId: user.id,
      action: 'FINDING_SNIPPET_UPDATE',
      entityType: 'FindingSnippet',
      entityId: updated.id,
      after: { aspect: updated.aspect, kind: updated.kind },
      ...extractRequestMeta(req),
    });
    return NextResponse.json({ snippet: updated });
  } catch (e) {
    return errorResponse(e);
  }
}

/** 刪除稽核發現片語;僅最高管理員。 */
export async function DELETE(req: Request, { params }: { params: { id: string } }) {
  try {
    const user = await requireRole('SUPER_ADMIN');
    const removed = await prisma.findingSnippet.delete({ where: { id: params.id } });
    await writeAuditLog({
      actorId: user.id,
      action: 'FINDING_SNIPPET_DELETE',
      entityType: 'FindingSnippet',
      entityId: params.id,
      before: { aspect: removed.aspect, kind: removed.kind, text: removed.text.slice(0, 80) },
      ...extractRequestMeta(req),
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
