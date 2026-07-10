import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { requireRole } from '@/lib/rbac';
import { deleteFileByKey } from '@/lib/storage';
import { errorResponse } from '@/lib/api';
import { POST_CATEGORIES, POST_STATUSES } from '@/lib/types';
import { writeAuditLog, extractRequestMeta } from '@/lib/audit-log';
// 排程時間解析與建立(POST)共用單一來源(lib/posts;UAT 批43)
import { postScheduleField as DTField, parsePostScheduleDT as parseDT } from '@/lib/posts';

const Body = z.object({
  title: z.string().min(2).optional(),
  category: z.enum(POST_CATEGORIES).optional(),
  contentMd: z.string().min(5).optional(),
  important: z.boolean().optional(),
  pinned: z.boolean().optional(),
  status: z.enum(POST_STATUSES).optional(),
  // 批33 排程上下架:publishAt=排定上架時間(空/未給且正在發布=立即);unpublishAt=排定下架(空=不自動下架)
  publishAt: DTField,
  unpublishAt: DTField,
});

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  try {
    const user = await requireRole('SUPER_ADMIN');
    const post = await prisma.post.findUnique({ where: { id: params.id } });
    if (!post) return NextResponse.json({ error: '公告不存在' }, { status: 404 });

    const body = Body.parse(await req.json());
    const publishingNow = body.status === 'PUBLISHED' && post.status !== 'PUBLISHED';

    // 上架時間:明確給值用之(空=立即上架/或清除排程);未給但正在發布=立即上架(now)。
    let publishedAt: Date | null | undefined = undefined;
    if (body.publishAt !== undefined) {
      publishedAt = body.publishAt ? parseDT(body.publishAt) : (publishingNow ? new Date() : null);
    } else if (publishingNow) {
      publishedAt = new Date();
    }
    // 下架時間:明確給值用之(空=清除);否則不動。
    let unpublishAt: Date | null | undefined = undefined;
    if (body.unpublishAt !== undefined) unpublishAt = body.unpublishAt ? parseDT(body.unpublishAt) : null;
    // 手動下架(狀態轉 ARCHIVED 未帶時間):記錄實際下架時刻,列表「上架/下架時間」才有據可顯
    // (UAT 批42:下架後時間欄仍只有上架時間)。既有排程時間已過=實際下架時刻,保留不覆寫;
    // 上架時間在未來(待發布被下架)不寫,避免違反「下架須晚於上架」的順序驗證。
    const archivingNow = body.status === 'ARCHIVED' && post.status !== 'ARCHIVED';
    if (unpublishAt === undefined && archivingNow) {
      const now = new Date();
      const pubRef = publishedAt !== undefined ? publishedAt : post.publishedAt;
      const hasPastUnpublish = post.unpublishAt && post.unpublishAt.getTime() <= now.getTime();
      if (!hasPastUnpublish && (!pubRef || pubRef.getTime() < now.getTime())) unpublishAt = now;
    }

    // 順序驗證(以套用後最終值):下架不可早於或等於上架。
    const finalPub = publishedAt !== undefined ? publishedAt : post.publishedAt;
    const finalUn = unpublishAt !== undefined ? unpublishAt : post.unpublishAt;
    if (finalPub && finalUn && finalUn.getTime() <= finalPub.getTime()) {
      return NextResponse.json({ error: '排定下架時間須晚於上架時間' }, { status: 400 });
    }

    const item = await prisma.post.update({
      where: { id: post.id },
      data: {
        title: body.title?.trim(),
        category: body.category,
        contentMd: body.contentMd,
        important: body.important,
        pinned: body.pinned,
        status: body.status,
        publishedAt,
        unpublishAt,
      },
    });

    const meta = extractRequestMeta(req);
    await writeAuditLog({
      actorId: user.id,
      action: publishingNow ? 'POST_PUBLISH' : 'POST_UPDATE',
      entityType: 'Post',
      entityId: item.id,
      after: { title: item.title, status: item.status, publishedAt: item.publishedAt, unpublishAt: item.unpublishAt },
      ...meta,
    });

    return NextResponse.json({ item });
  } catch (e) {
    return errorResponse(e);
  }
}

export async function DELETE(req: Request, { params }: { params: { id: string } }) {
  try {
    const user = await requireRole('SUPER_ADMIN');
    const post = await prisma.post.findUnique({ where: { id: params.id } });
    if (!post) return NextResponse.json({ error: '公告不存在' }, { status: 404 });

    // 先取附件清單再刪(DB 紀錄由 cascade 刪除,實體檔另行清理避免磁碟孤兒)
    const atts = await prisma.postAttachment.findMany({ where: { postId: post.id }, select: { storageKey: true } });
    await prisma.post.delete({ where: { id: post.id } });
    for (const a of atts) {
      try {
        await deleteFileByKey(a.storageKey);
      } catch (err) {
        console.error('[posts] 刪除附件實體檔失敗：', (err as Error).message);
      }
    }

    const meta = extractRequestMeta(req);
    await writeAuditLog({
      actorId: user.id, action: 'POST_DELETE', entityType: 'Post',
      entityId: post.id, before: { title: post.title }, ...meta,
    });

    return NextResponse.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
