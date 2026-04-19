import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { requireRole, AuthError } from '@/lib/rbac';
import { writeAuditLog, extractRequestMeta } from '@/lib/audit-log';

const Body = z.object({
  code: z.string().min(1).max(40),
  name: z.string().min(1).max(200),
  shortName: z.string().max(80).optional(),
  parentId: z.string().optional(),
});

export async function POST(req: Request) {
  try {
    const user = await requireRole('ADMIN');
    const body = Body.parse(await req.json());

    const dup = await prisma.organization.findUnique({ where: { code: body.code } });
    if (dup) return NextResponse.json({ error: `代碼 ${body.code} 已存在` }, { status: 400 });

    const org = await prisma.organization.create({
      data: {
        code: body.code,
        name: body.name,
        shortName: body.shortName,
        parentId: body.parentId,
      },
    });

    const meta = extractRequestMeta(req);
    await writeAuditLog({
      actorId: user.id,
      action: 'ORG_CREATE',
      entityType: 'Organization',
      entityId: org.id,
      after: org,
      ...meta,
    });

    return NextResponse.json(org);
  } catch (e) {
    if (e instanceof AuthError) return NextResponse.json({ error: e.message }, { status: e.status });
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}
