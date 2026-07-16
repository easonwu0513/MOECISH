import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { requireRole } from '@/lib/rbac';
import { errorResponse } from '@/lib/api';
import { writeAuditLog, extractRequestMeta } from '@/lib/audit-log';

const Patch = z.object({
  category: z.string().min(1).max(200).optional(),
  workflowOrder: z.number().int().min(0).max(9999).optional(),
  subGroup: z.string().max(100).nullable().optional(),
  title: z.string().min(2).max(200).optional(),
  attachment: z.string().max(500).optional(),
  audience: z.string().max(200).optional(),
  subject: z.string().min(1).max(1000).optional(),
  content: z.string().min(1).max(20000).optional(),
  enabled: z.boolean().optional(),
});

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  try {
    const user = await requireRole('SUPER_ADMIN');
    const body = Patch.parse(await req.json());
    const template = await prisma.letterTemplate.update({
      where: { id: params.id },
      data: {
        ...(body.category !== undefined ? { category: body.category } : {}),
        ...(body.workflowOrder !== undefined ? { workflowOrder: body.workflowOrder } : {}),
        ...(body.subGroup !== undefined ? { subGroup: body.subGroup } : {}),
        ...(body.title !== undefined ? { title: body.title } : {}),
        ...(body.attachment !== undefined ? { attachment: body.attachment } : {}),
        ...(body.audience !== undefined ? { audience: body.audience } : {}),
        ...(body.subject !== undefined ? { subject: body.subject } : {}),
        ...(body.content !== undefined ? { content: body.content } : {}),
        ...(body.enabled !== undefined ? { enabled: body.enabled } : {}),
      },
    });
    await writeAuditLog({
      actorId: user.id,
      action: 'LETTER_TEMPLATE_UPDATE',
      entityType: 'LetterTemplate',
      entityId: template.id,
      after: { title: template.title, category: template.category },
      ...extractRequestMeta(req),
    });
    return NextResponse.json({ template });
  } catch (e) {
    return errorResponse(e);
  }
}

export async function DELETE(req: Request, { params }: { params: { id: string } }) {
  try {
    const user = await requireRole('SUPER_ADMIN');
    await prisma.letterTemplate.delete({ where: { id: params.id } });
    await writeAuditLog({
      actorId: user.id,
      action: 'LETTER_TEMPLATE_DELETE',
      entityType: 'LetterTemplate',
      entityId: params.id,
      ...extractRequestMeta(req),
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
