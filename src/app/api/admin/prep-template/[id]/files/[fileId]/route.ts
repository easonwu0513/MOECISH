import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireRole } from '@/lib/rbac';
import { deleteFileByKey } from '@/lib/storage';
import { errorResponse } from '@/lib/api';
import { writeAuditLog, extractRequestMeta } from '@/lib/audit-log';

/** 刪除標準清單項目的文件範本(SUPER_ADMIN;fileId 須屬於該項目,防跨項目指定)。 */
export async function DELETE(req: Request, { params }: { params: { id: string; fileId: string } }) {
  try {
    const user = await requireRole('SUPER_ADMIN');
    const file = await prisma.prepTemplateFile.findFirst({
      where: { id: params.fileId, itemId: params.id },
    });
    if (!file) return NextResponse.json({ error: '範本檔不存在' }, { status: 404 });

    await prisma.prepTemplateFile.delete({ where: { id: file.id } });
    try {
      await deleteFileByKey(file.storageKey);
    } catch (err) {
      // DB 紀錄已刪=功能上已完成;實體檔清理失敗只記 log,不讓使用者看到假失敗
      console.error('[prep-template] 刪除範本實體檔失敗:', (err as Error).message);
    }

    await writeAuditLog({
      actorId: user.id, action: 'PREP_TEMPLATE_FILE_DELETE', entityType: 'PrepTemplateFile',
      entityId: file.id, before: { name: file.originalName }, ...extractRequestMeta(req),
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
