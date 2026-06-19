import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { requireRole } from '@/lib/rbac';
import { errorResponse } from '@/lib/api';
import { writeAuditLog, extractRequestMeta } from '@/lib/audit-log';

const Body = z.object({
  name: z.string().min(2),
  year: z.number().int().min(1900).max(9999),
  copyFromId: z.string().optional(),
});

/** 建立題庫版本;可從既有版本複製全部項目(年度換版)。 */
export async function POST(req: Request) {
  try {
    const user = await requireRole('SUPER_ADMIN');
    const body = Body.parse(await req.json());

    const dup = await prisma.checklistVersion.findFirst({ where: { name: body.name } });
    if (dup) return NextResponse.json({ error: '同名版本已存在' }, { status: 400 });

    const version = await prisma.checklistVersion.create({
      data: { name: body.name, year: body.year, isActive: false },
    });

    let copied = 0;
    if (body.copyFromId) {
      const items = await prisma.checklistItem.findMany({
        where: { versionId: body.copyFromId },
        orderBy: { orderIndex: 'asc' },
      });
      for (const it of items) {
        await prisma.checklistItem.create({
          data: {
            versionId: version.id,
            dimension: it.dimension,
            itemNo: it.itemNo,
            content: it.content,
            auditBasis: it.auditBasis,
            auditFocus: it.auditFocus,
            expectedEvidence: it.expectedEvidence,
            orderIndex: it.orderIndex,
          },
        });
        copied++;
      }
    }

    const meta = extractRequestMeta(req);
    await writeAuditLog({
      actorId: user.id,
      action: 'CHECKLIST_VERSION_CREATE',
      entityType: 'ChecklistVersion',
      entityId: version.id,
      after: { name: version.name, year: version.year, copiedItems: copied },
      ...meta,
    });

    return NextResponse.json({ item: version, copied });
  } catch (e) {
    return errorResponse(e);
  }
}
