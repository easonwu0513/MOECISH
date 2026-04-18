import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { assertCycleAccess, AuthError } from '@/lib/rbac';
import { canTransition } from '@/lib/state-machine';
import type { CycleStatus, Role } from '@/lib/types';
import { writeAuditLog, extractRequestMeta } from '@/lib/audit-log';

const Body = z.object({ target: z.string(), reason: z.string().optional() });

export async function POST(req: Request, { params }: { params: { id: string } }) {
  try {
    const { user, cycle } = await assertCycleAccess(params.id);
    const body = Body.parse(await req.json());
    const from = cycle.status as CycleStatus;
    const to = body.target as CycleStatus;

    if (!canTransition(from, to, user.role as Role)) {
      return NextResponse.json({ error: '不允許的狀態轉換' }, { status: 400 });
    }

    // Module 1 gate: 送出前要求 >= 1 題已作答
    if (from === 'DRAFT' && to === 'RESPONDENT_SUBMITTED') {
      const count = await prisma.checklistResponse.count({
        where: { cycleId: cycle.id, NOT: { compliance: null } },
      });
      if (count === 0) {
        return NextResponse.json({ error: '請至少填寫一題再送出' }, { status: 400 });
      }
    }

    // Module 1 gate: 主管核可須先有簽章
    if (from === 'RESPONDENT_SUBMITTED' && to === 'SUPERVISOR_APPROVED') {
      const sig = await prisma.signature.findFirst({
        where: { cycleId: cycle.id, signerRole: 'SUPERVISOR' },
      });
      if (!sig) {
        return NextResponse.json({ error: '主管核可前請先上傳簽章' }, { status: 400 });
      }
    }

    const updated = await prisma.auditCycle.update({
      where: { id: cycle.id },
      data: {
        status: to,
        closedAt: to === 'CLOSED' ? new Date() : undefined,
        stateTransitions: {
          create: { fromStatus: from, toStatus: to, actorId: user.id, reason: body.reason },
        },
      },
    });

    const meta = extractRequestMeta(req);
    await writeAuditLog({
      actorId: user.id,
      action: 'CYCLE_TRANSITION',
      entityType: 'AuditCycle',
      entityId: cycle.id,
      before: { status: from },
      after: { status: to },
      ...meta,
    });

    return NextResponse.json({ status: updated.status });
  } catch (e) {
    if (e instanceof AuthError) return NextResponse.json({ error: e.message }, { status: e.status });
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}
