import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { requireRole } from '@/lib/rbac';
import { errorResponse } from '@/lib/api';
import { POST_CATEGORIES } from '@/lib/types';
import { writeAuditLog, extractRequestMeta } from '@/lib/audit-log';
import { postScheduleField, parsePostScheduleDT } from '@/lib/posts';

const Body = z.object({
  title: z.string().min(2, '請輸入標題'),
  category: z.enum(POST_CATEGORIES),
  contentMd: z.string().min(5, '請輸入內文'),
  slug: z.string().regex(/^[a-z0-9-]*$/, 'slug 僅限小寫英數與連字號').optional(),
  important: z.boolean().optional(),
  pinned: z.boolean().optional(),
  // 排程上下架(UAT 批43):建立草稿時一併保存——原本只有 PATCH 收此二欄,
  // 「新增公告+儲存草稿」排程默默丟棄,之後按「發布」讀不到排程就變立即上架。
  publishAt: postScheduleField,
  unpublishAt: postScheduleField,
});

export async function POST(req: Request) {
  try {
    const user = await requireRole('SUPER_ADMIN');
    const body = Body.parse(await req.json());

    const slug = body.slug?.trim() || `post-${Date.now().toString(36)}`;
    const dup = await prisma.post.findUnique({ where: { slug } });
    if (dup) return NextResponse.json({ error: '此 slug 已存在' }, { status: 400 });

    // 排程時間隨草稿保存(status 仍為 DRAFT,不會提前見前台;lifecycle 由 status+時間窗判定)
    const publishedAt = body.publishAt ? parsePostScheduleDT(body.publishAt) : null;
    const unpublishAt = body.unpublishAt ? parsePostScheduleDT(body.unpublishAt) : null;
    if (publishedAt && unpublishAt && unpublishAt.getTime() <= publishedAt.getTime()) {
      return NextResponse.json({ error: '排定下架時間須晚於上架時間' }, { status: 400 });
    }

    const item = await prisma.post.create({
      data: {
        slug,
        title: body.title.trim(),
        category: body.category,
        contentMd: body.contentMd,
        important: body.important ?? false,
        pinned: body.pinned ?? false,
        status: 'DRAFT',
        publishedAt,
        unpublishAt,
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
    return errorResponse(e);
  }
}
