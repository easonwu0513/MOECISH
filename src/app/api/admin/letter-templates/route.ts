import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { requireRole } from '@/lib/rbac';
import { errorResponse } from '@/lib/api';
import { writeAuditLog, extractRequestMeta } from '@/lib/audit-log';

export async function GET() {
  try {
    await requireRole('SUPER_ADMIN');
    const templates = await prisma.letterTemplate.findMany({
      orderBy: [{ workflowOrder: 'asc' }, { createdAt: 'asc' }],
    });
    return NextResponse.json({ templates });
  } catch (e) {
    return errorResponse(e);
  }
}

const Body = z.object({
  category: z.string().min(1).max(200),
  workflowOrder: z.number().int().min(0).max(9999).optional(),
  subGroup: z.string().max(100).nullable().optional(),
  title: z.string().min(2).max(200),
  attachment: z.string().max(500).optional(),
  audience: z.string().max(200).optional(),
  subject: z.string().min(1).max(1000),
  content: z.string().min(1).max(20000),
  enabled: z.boolean().optional(),
});

/** 產生新範本的 templateKey（避免與 seed 的數字鍵衝突，用 custom- 前綴）。 */
function customKey(): string {
  return `custom-${Math.random().toString(36).slice(2, 8)}${Date.now().toString(36)}`;
}

export async function POST(req: Request) {
  try {
    const user = await requireRole('SUPER_ADMIN');
    const body = Body.parse(await req.json());
    const template = await prisma.letterTemplate.create({
      data: {
        templateKey: customKey(),
        category: body.category,
        workflowOrder: body.workflowOrder ?? 99,
        subGroup: body.subGroup ?? null,
        title: body.title,
        attachment: body.attachment || '無',
        audience: body.audience || '',
        subject: body.subject,
        content: body.content,
      },
    });
    await writeAuditLog({
      actorId: user.id,
      action: 'LETTER_TEMPLATE_CREATE',
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
