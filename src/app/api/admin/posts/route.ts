import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { requireRole, AuthError } from '@/lib/rbac';
import { POST_CATEGORIES } from '@/lib/types';
import { writeAuditLog, extractRequestMeta } from '@/lib/audit-log';

const Body = z.object({
  title: z.string().min(2, '請輸入標題'),
  category: z.enum(POST_CATEGORIES),
  contentMd: z.string().min(5, '請輸入內文'),
  slug: z.string().regex(/^[a-z0-9-]*$/, 'slug 僅限小寫英數與連字號').optional(),
  important: z.boolean().optional(),
  pinned: z.boolean().optional(),
});

export async function POST(req: Request) {
  try {
    const user = await requireRole('SUPER_ADMIN');
    const body = Body.parse(await req.json());

    const slug = body.slug?.trim() || `post-${Date.now().toString(36)}`;
    const dup = await prisma.post.findUnique({ where: { slug } });
    if (dup) return NextResponse.json({ error: '此 slug 已存在' }, { status: 400 });

    const item = await prisma.post.create({
      data: {
        slug,
        title: body.title.trim(),
        category: body.category,
        contentMd: body.contentMd,
        important: body.important ?? false,
        pinned: body.pinned ?? false,
        status: 'DRAFT',
        authorId: user.id,
      },
    });

    const meta = extractRequestMeta(req);
    await writeAuditLog({
      actorId: user.id, action: 'POST_CREATE', entityType: 'Post',
      entityId: item.id, after: { title: item.title }, ...meta,
    });

    return NextResponse.json({ item });
  } catch (e) {
    if (e instanceof AuthError) return NextResponse.json({ error: e.message }, { status: e.status });
    if (e instanceof z.ZodError) return NextResponse.json({ error: e.errors[0]?.message ?? '輸入有誤' }, { status: 400 });
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}
