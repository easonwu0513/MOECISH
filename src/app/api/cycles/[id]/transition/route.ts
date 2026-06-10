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

    // 缺失發布 → 矯正執行:至少要有一筆缺失
    if (to === 'REMEDIATION') {
      const count = await prisma.deficiency.count({ where: { cycleId: cycle.id } });
      if (count === 0) {
        return NextResponse.json({ error: '尚未發布任何缺失，無法開放填報' }, { status: 400 });
      }
    }

    // 結案前置條件:全數缺失審核通過 + 已上傳用印掃描檔
    if (to === 'CLOSED') {
      const notPassed = await prisma.deficiency.count({
        where: { cycleId: cycle.id, NOT: { action: { status: 'PASSED' } } },
      });
      if (notPassed > 0) {
        return NextResponse.json(
          { error: `尚有 ${notPassed} 項缺失未審核通過，無法結案` },
          { status: 400 },
        );
      }
      const signed = await prisma.signedReport.findFirst({
        where: { cycleId: cycle.id, confirmedAt: { not: null } },
      });
      if (!signed) {
        return NextResponse.json(
          { error: '請先上傳並確認用印掃描檔，再行結案' },
          { status: 400 },
        );
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
