import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { requireRole } from '@/lib/rbac';
import { errorResponse } from '@/lib/api';
import { writeAuditLog, extractRequestMeta } from '@/lib/audit-log';

const ASPECTS = ['', 'STRATEGY', 'MANAGEMENT', 'TECHNICAL'] as const;
const KINDS = ['', 'COMPLIANCE', 'IMPROVE', 'SUGGEST'] as const;

const CreateBody = z.object({
  aspect: z.enum(ASPECTS).default(''),
  kind: z.enum(KINDS).default(''),
  text: z.string().trim().min(1, '內容不可空白').max(2000),
  orderIndex: z.number().int().optional(),
});

/** 新增稽核發現片語(剪貼簿);僅最高管理員。 */
export async function POST(req: Request) {
  try {
    const user = await requireRole('SUPER_ADMIN');
    const body = CreateBody.parse(await req.json());
    const created = await prisma.findingSnippet.create({
      data: { aspect: body.aspect, kind: body.kind, text: body.text, orderIndex: body.orderIndex ?? 0 },
    });
    await writeAuditLog({
      actorId: user.id,
      action: 'FINDING_SNIPPET_CREATE',
      entityType: 'FindingSnippet',
      entityId: created.id,
      after: { aspect: created.aspect, kind: created.kind },
      ...extractRequestMeta(req),
    });
    return NextResponse.json({ snippet: created });
  } catch (e) {
    return errorResponse(e);
  }
}
