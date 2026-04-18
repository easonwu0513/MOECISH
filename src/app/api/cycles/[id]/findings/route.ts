import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { assertCycleAccess, AuthError } from '@/lib/rbac';
import {
  DIMENSIONS,
  FINDING_ASPECTS,
  FINDING_TYPES,
  type CycleStatus,
} from '@/lib/types';
import { writeAuditLog, extractRequestMeta } from '@/lib/audit-log';

const Body = z.object({
  findingNo: z.string().min(1),
  aspect: z.enum(FINDING_ASPECTS),
  type: z.enum(FINDING_TYPES),
  dimension: z.enum(DIMENSIONS),
  title: z.string().min(1),
  description: z.string().min(1),
});

export async function POST(req: Request, { params }: { params: { id: string } }) {
  try {
    const { user, cycle } = await assertCycleAccess(params.id);
    if (user.role !== 'AUDITOR' && user.role !== 'ADMIN') {
      return NextResponse.json({ error: '僅稽核委員可開立發現' }, { status: 403 });
    }

    const body = Body.parse(await req.json());

    const created = await prisma.finding.create({
      data: {
        cycleId: cycle.id,
        findingNo: body.findingNo,
        aspect: body.aspect,
        type: body.type,
        dimension: body.dimension,
        title: body.title,
        description: body.description,
        issuedById: user.id,
        ...(body.type === 'NEEDS_IMPROVEMENT'
          ? { remediation: { create: { status: 'PENDING' } } }
          : {}),
      },
    });

    // Advance cycle status to FINDINGS_ISSUED if not already
    const terminal: CycleStatus[] = ['FINDINGS_ISSUED', 'REMEDIATION_IN_PROGRESS', 'CLOSED'];
    if (!terminal.includes(cycle.status as CycleStatus)) {
      await prisma.auditCycle.update({
        where: { id: cycle.id },
        data: {
          status: 'FINDINGS_ISSUED',
          stateTransitions: {
            create: { fromStatus: cycle.status, toStatus: 'FINDINGS_ISSUED', actorId: user.id },
          },
        },
      });
    }

    const meta = extractRequestMeta(req);
    await writeAuditLog({
      actorId: user.id,
      action: 'FINDING_CREATE',
      entityType: 'Finding',
      entityId: created.id,
      after: created,
      ...meta,
    });

    return NextResponse.json(created);
  } catch (e) {
    if (e instanceof AuthError) return NextResponse.json({ error: e.message }, { status: e.status });
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}
