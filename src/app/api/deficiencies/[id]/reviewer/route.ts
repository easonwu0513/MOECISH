import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { requireRole } from '@/lib/rbac';
import { errorResponse } from '@/lib/api';
import { writeAuditLog, extractRequestMeta } from '@/lib/audit-log';

const Body = z.object({ auditorId: z.string().min(1).nullable() });

/**
 * 中心(SUPER_ADMIN)指派/變更某缺失的「審閱委員」。
 * 只能指派給該缺失的相關開立委員(deficiencyAuthors);傳 auditorId=null 可清除指派。
 */
export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  try {
    const admin = await requireRole('SUPER_ADMIN');
    const def = await prisma.deficiency.findUnique({
      where: { id: params.id },
      select: { id: true, cycleId: true, reviewerAuditorId: true },
    });
    if (!def) return NextResponse.json({ error: '缺失不存在' }, { status: 404 });

    const { auditorId } = Body.parse(await req.json());
    if (auditorId) {
      // 只能指派給「參與此次稽核(受指派)的委員」(預設為開立委員,中心可改為其他參與委員)
      const assigned = await prisma.auditorAssignment.findUnique({
        where: { cycleId_auditorId: { cycleId: def.cycleId, auditorId } },
      });
      if (!assigned) {
        return NextResponse.json({ error: '只能指派給參與此次稽核的委員' }, { status: 400 });
      }
    }

    await prisma.deficiency.update({
      where: { id: def.id },
      data: { reviewerAuditorId: auditorId },
    });
    await writeAuditLog({
      actorId: admin.id,
      action: 'deficiency.reviewer-assign',
      entityType: 'Deficiency',
      entityId: def.id,
      before: { reviewerAuditorId: def.reviewerAuditorId },
      after: { reviewerAuditorId: auditorId },
      ...extractRequestMeta(req),
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
