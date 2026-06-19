import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireRole } from '@/lib/rbac';
import { writeAuditLog, extractRequestMeta } from '@/lib/audit-log';
import { errorResponse } from '@/lib/api';

/** 最高管理員刪除需求項(已有上傳檔案則禁止) */
export async function DELETE(req: Request, { params }: { params: { id: string } }) {
  try {
    const user = await requireRole('SUPER_ADMIN');
    const item = await prisma.prepRequirement.findUnique({
      where: { id: params.id },
      include: { submission: true },
    });
    if (!item) return NextResponse.json({ error: '需求項不存在' }, { status: 404 });

    if (item.submission) {
      const fileCount = await prisma.evidence.count({
        where: { targetType: 'PREP_SUBMISSION', targetId: item.submission.id },
      });
      if (fileCount > 0) {
        return NextResponse.json({ error: '機關已上傳檔案,不可刪除此需求項' }, { status: 400 });
      }
    }

    await prisma.$transaction([
      prisma.prepSubmission.deleteMany({ where: { requirementId: item.id } }),
      prisma.prepRequirement.delete({ where: { id: item.id } }),
    ]);

    const meta = extractRequestMeta(req);
    await writeAuditLog({
      actorId: user.id, action: 'PREP_REQUIREMENT_DELETE', entityType: 'PrepRequirement',
      entityId: item.id, before: { title: item.title }, ...meta,
    });

    return NextResponse.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
