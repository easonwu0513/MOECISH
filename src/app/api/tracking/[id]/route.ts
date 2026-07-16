import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { requireRole } from '@/lib/rbac';
import { errorResponse } from '@/lib/api';
import { writeAuditLog, extractRequestMeta } from '@/lib/audit-log';
import { TRACKING_CADENCE_OPTIONS } from '@/lib/types';

const Body = z.object({
  // 二者皆選填:各自傳入即更新。cadenceMonths 限預設選項;assignedAuditorId=null 為取消指派。
  cadenceMonths: z.number().int().optional(),
  assignedAuditorId: z.string().min(1).nullable().optional(),
});

/**
 * 中心調整某持續列管缺失(批71):回報週期(cadenceMonths)、指派/改指派/取消協審委員。
 *  - 僅中心(SUPER_ADMIN);列管項須為「持續列管中(TRACKING)」。
 *  - 協審委員須為在職 AUDITOR,且比照利益迴避:不得指派服務該機關者(含多重身分授權)。
 */
export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  try {
    const user = await requireRole('SUPER_ADMIN');
    const body = Body.parse(await req.json());
    if (body.cadenceMonths === undefined && body.assignedAuditorId === undefined) {
      return NextResponse.json({ error: '未提供要更新的欄位' }, { status: 400 });
    }
    if (body.cadenceMonths !== undefined && !(TRACKING_CADENCE_OPTIONS as readonly number[]).includes(body.cadenceMonths)) {
      return NextResponse.json({ error: '回報週期不在允許範圍' }, { status: 400 });
    }

    const tracked = await prisma.trackedDeficiency.findUnique({
      where: { id: params.id },
      select: { id: true, organizationId: true, status: true },
    });
    if (!tracked) return NextResponse.json({ error: '列管項不存在' }, { status: 404 });
    if (tracked.status !== 'TRACKING') {
      return NextResponse.json({ error: '此缺失已結束列管，無法調整' }, { status: 400 });
    }

    const data: { cadenceMonths?: number; assignedAuditorId?: string | null } = {};
    if (body.cadenceMonths !== undefined) data.cadenceMonths = body.cadenceMonths;

    if (body.assignedAuditorId !== undefined) {
      if (body.assignedAuditorId === null) {
        data.assignedAuditorId = null;
      } else {
        const auditor = await prisma.user.findUnique({
          where: { id: body.assignedAuditorId },
          include: { roleGrants: { where: { endedAt: null } } },
        });
        if (!auditor || auditor.role !== 'AUDITOR' || !auditor.isActive) {
          return NextResponse.json({ error: '稽核委員不存在或已停用' }, { status: 400 });
        }
        // 利益迴避(比照批64 委員指派):不得指派服務該機關者——含多重身分之 ORG_ADMIN 授權
        const holdsOrgAdminOfOrg = auditor.roleGrants.some(
          (g) => g.role === 'ORG_ADMIN' && g.organizationId === tracked.organizationId,
        );
        if ((auditor.organizationId && auditor.organizationId === tracked.organizationId) || holdsOrgAdminOfOrg) {
          return NextResponse.json(
            { error: '委員不得協審自己服務之機關（迴避原則，含其多重身分所屬機關）' },
            { status: 400 },
          );
        }
        data.assignedAuditorId = auditor.id;
      }
    }

    await prisma.trackedDeficiency.update({ where: { id: tracked.id }, data });

    await writeAuditLog({
      actorId: user.id,
      action: 'TRACKED_UPDATE',
      entityType: 'TrackedDeficiency',
      entityId: tracked.id,
      after: data,
      ...extractRequestMeta(req),
    });

    return NextResponse.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
