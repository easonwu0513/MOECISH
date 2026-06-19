import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { assertDeficiencyAccess, AuthError } from '@/lib/rbac';
import { errorResponse } from '@/lib/api';
import { actionEditable } from '@/lib/state-machine';
import { EXEC_STATUSES, type ActionStatus } from '@/lib/types';
import { writeAuditLog, extractRequestMeta } from '@/lib/audit-log';

const SaveBody = z.object({
  rootCause: z.string().optional(),
  measureStrategy: z.string().nullable().optional(),
  measureManagement: z.string().nullable().optional(),
  measureTechnical: z.string().nullable().optional(),
  plannedDate: z.string().nullable().optional(),   // ISO date
  trackingMethod: z.string().optional(),
  execStatus: z.enum(EXEC_STATUSES).nullable().optional(),
  actualDate: z.string().nullable().optional(),
  extendedDate: z.string().nullable().optional(),
  delayReason: z.string().nullable().optional(),
});

/** 機關管理員儲存矯正措施草稿 */
export async function PUT(req: Request, { params }: { params: { id: string } }) {
  try {
    const { user, deficiency } = await assertDeficiencyAccess(params.id);
    if (user.role !== 'ORG_ADMIN') {
      return NextResponse.json({ error: '僅機關管理員可填報矯正措施' }, { status: 403 });
    }
    if (deficiency.cycle.status !== 'REMEDIATION') {
      return NextResponse.json({ error: '此週期目前未開放填報' }, { status: 400 });
    }
    const action = deficiency.action;
    if (!action) return NextResponse.json({ error: '矯正措施紀錄不存在' }, { status: 404 });
    if (!actionEditable(action.status as ActionStatus)) {
      return NextResponse.json({ error: '此項目已送審或已通過，不可編輯' }, { status: 400 });
    }

    const body = SaveBody.parse(await req.json());
    const toDate = (v: string | null | undefined) => {
      if (v === undefined) return undefined;
      if (v === null || v === '') return null;
      const d = new Date(v);
      if (Number.isNaN(d.getTime())) throw new AuthError(400, '日期格式不正確');
      return d;
    };

    const updated = await prisma.correctiveAction.update({
      where: { id: action.id },
      data: {
        status: action.status === 'PENDING' ? 'DRAFT' : action.status,
        rootCause: body.rootCause,
        measureStrategy: body.measureStrategy === undefined ? undefined : body.measureStrategy,
        measureManagement: body.measureManagement === undefined ? undefined : body.measureManagement,
        measureTechnical: body.measureTechnical === undefined ? undefined : body.measureTechnical,
        plannedDate: toDate(body.plannedDate),
        trackingMethod: body.trackingMethod,
        execStatus: body.execStatus === undefined ? undefined : body.execStatus,
        actualDate: toDate(body.actualDate),
        extendedDate: toDate(body.extendedDate),
        delayReason: body.delayReason === undefined ? undefined : body.delayReason,
      },
    });

    const meta = extractRequestMeta(req);
    await writeAuditLog({
      actorId: user.id,
      action: 'ACTION_SAVE',
      entityType: 'CorrectiveAction',
      entityId: action.id,
      after: { status: updated.status },
      ...meta,
    });

    return NextResponse.json({ item: updated });
  } catch (e) {
    return errorResponse(e);
  }
}
