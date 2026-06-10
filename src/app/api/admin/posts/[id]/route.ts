import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { requireRole, AuthError } from '@/lib/rbac';
import { POST_CATEGORIES, POST_STATUSES } from '@/lib/types';
import { writeAuditLog, extractRequestMeta } from '@/lib/audit-log';

const Body = z.object({
  title: z.string().min(2).optional(),
  category: z.enum(POST_CATEGORIES).optional(),
  contentMd: z.string().min(5).optional(),
  important: z.boolean().optional(),
  pinned: z.boolean().optional(),
  status: z.enum(POST_STATUSES).optional(),
});

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  try {
    const user = await requireRole('SUPER_ADMIN');
    const post = await prisma.post.findUnique({ where: { id: params.id } });
    if (!post) return NextResponse.json({ error: '公告不存在' }, { status: 404 });

    const body = Body.parse(await req.json());
    const publishingNow = body.status === 'PUBLISHED' && post.status !== 'PUBLISHED';

    const item = await prisma.post.update({
      where: { id: post.id },
      data: {
        title: body.title?.trim(),
        category: body.category,
        contentMd: body.contentMd,
        important: body.important,
        pinned: body.pinned,
        status: body.status,
        publishedAt: publishingNow ? new Date() : undefined,
      },
    });

    const meta = extractRequestMeta(req);
    await writeAuditLog({
      actorId: user.id,
      action: publishingNow ? 'POST_PUBLISH' : 'POST_UPDATE',
      entityType: 'Post',
      entityId: item.id,
      after: { title: item.title, status: item.status },
      ...meta,
    });

    return NextResponse.json({ item });
  } catch (e) {
    if (e instanceof AuthError) return NextResponse.json({ error: e.message }, { status: e.status });
    if (e instanceof z.ZodError) return NextResponse.json({ error: e.errors[0]?.message ?? '輸入有誤' }, { status: 400 });
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}

export async function DELETE(req: Request, { params }: { params: { id: string } }) {
  try {
    const user = await requireRole('SUPER_ADMIN');
    const post = await prisma.post.findUnique({ where: { id: params.id } });
    if (!post) return NextResponse.json({ error: '公告不存在' }, { status: 404 });

    await prisma.post.delete({ where: { id: post.id } });

    const meta = extractRequestMeta(req);
    await writeAuditLog({
      actorId: user.id, action: 'POST_DELETE', entityType: 'Post',
      entityId: post.id, before: { title: post.title }, ...meta,
    });

    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof AuthError) return NextResponse.json({ error: e.message }, { status: e.status });
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}
