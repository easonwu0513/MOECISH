import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { requireRole } from '@/lib/rbac';
import { errorResponse } from '@/lib/api';
import { writeAuditLog, extractRequestMeta } from '@/lib/audit-log';

const Body = z.object({
  name: z.string().trim().min(1).max(200),
  shortName: z.string().trim().max(80).optional(),
});

/**
 * 編輯機關資料(SUPER_ADMIN 專用):可改全名 / 簡稱。
 * 機關代碼(code)為系統唯一鍵、對外對照識別,不在此變更(避免破壞既有對照與匯入)。
 */
export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  try {
    const user = await requireRole('SUPER_ADMIN');
    const target = await prisma.organization.findUnique({ where: { id: params.id } });
    if (!target) return NextResponse.json({ error: '機關不存在' }, { status: 404 });

    const body = Body.parse(await req.json());
    const shortName = body.shortName && body.shortName.length > 0 ? body.shortName : null;

    const org = await prisma.organization.update({
      where: { id: target.id },
      data: { name: body.name, shortName },
    });

    const meta = extractRequestMeta(req);
    await writeAuditLog({
      actorId: user.id,
      action: 'ORG_UPDATE',
      entityType: 'Organization',
      entityId: org.id,
      before: { name: target.name, shortName: target.shortName },
      after: { name: org.name, shortName: org.shortName },
      ...meta,
    });

    return NextResponse.json({ item: { id: org.id, name: org.name, shortName: org.shortName } });
  } catch (e) {
    return errorResponse(e);
  }
}
