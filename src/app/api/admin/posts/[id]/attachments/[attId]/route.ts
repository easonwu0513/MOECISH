import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireRole } from '@/lib/rbac';
import { deleteFileByKey } from '@/lib/storage';
import { errorResponse } from '@/lib/api';
import { writeAuditLog, extractRequestMeta } from '@/lib/audit-log';

/** 刪除公告附件(SUPER_ADMIN;attId 須屬於該公告)。 */
export async function DELETE(req: Request, { params }: { params: { id: string; attId: string } }) {
  try {
    const user = await requireRole('SUPER_ADMIN');
    const att = await prisma.postAttachment.findFirst({
      where: { id: params.attId, postId: params.id },
    });
    if (!att) return NextResponse.json({ error: '附件不存在' }, { status: 404 });

    await prisma.postAttachment.delete({ where: { id: att.id } });
    try {
      await deleteFileByKey(att.storageKey);
    } catch (err) {
      // DB 紀錄已刪=功能上已完成;實體檔清理失敗只記 log
      console.error('[posts] 刪除附件實體檔失敗：', (err as Error).message);
    }

    await writeAuditLog({
      actorId: user.id, action: 'POST_ATTACHMENT_DELETE', entityType: 'PostAttachment',
      entityId: att.id, before: { name: att.fileName }, ...extractRequestMeta(req),
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
