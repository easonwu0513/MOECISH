import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { requireRole, AuthError } from '@/lib/rbac';
import { writeAuditLog, extractRequestMeta } from '@/lib/audit-log';

const Body = z.object({
  decision: z.enum(['APPROVED', 'NEEDS_REWORK']),
  comment: z.string().optional(),
});

export async function POST(req: Request, { params }: { params: { id: string } }) {
  try {
    const user = await requireRole('AUDITOR', 'ADMIN');
    const body = Body.parse(await req.json());

    const finding = await prisma.finding.findUnique({
      where: { id: params.id },
      include: { remediation: true, cycle: true },
    });
    if (!finding || !finding.remediation) {
      return NextResponse.json({ error: '改善單不存在' }, { status: 404 });
    }
    const rem = finding.remediation;
    if (rem.status !== 'SUBMITTED') {
      return NextResponse.json({ error: '僅 SUBMITTED 狀態可審核' }, { status: 400 });
    }

    const updated = await prisma.remediation.update({
      where: { id: rem.id },
      data: {
        status: body.decision,
        currentRound: body.decision === 'NEEDS_REWORK' ? rem.currentRound + 1 : rem.currentRound,
        decisions: {
          create: {
            round: rem.currentRound,
            decision: body.decision,
            comment: body.comment ?? null,
            decidedById: user.id,
          },
        },
      },
    });

    // If all NEEDS_IMPROVEMENT findings of this cycle are APPROVED → CLOSED (auto)
    if (body.decision === 'APPROVED') {
      const pending = await prisma.finding.count({
        where: {
          cycleId: finding.cycleId,
          type: 'NEEDS_IMPROVEMENT',
          OR: [
            { remediation: null },
            { remediation: { NOT: { status: 'APPROVED' } } },
          ],
        },
      });
      if (pending === 0) {
        await prisma.auditCycle.update({
          where: { id: finding.cycleId },
          data: {
            status: 'CLOSED',
            closedAt: new Date(),
            stateTransitions: {
              create: {
                fromStatus: finding.cycle.status,
                toStatus: 'CLOSED',
                actorId: user.id,
                reason: '全部改善項目已核可',
              },
            },
          },
        });
      }
    }

    const meta = extractRequestMeta(req);
    await writeAuditLog({
      actorId: user.id,
      action: `REMEDIATION_${body.decision}`,
      entityType: 'Remediation',
      entityId: updated.id,
      after: { status: body.decision, comment: body.comment },
      ...meta,
    });

    return NextResponse.json(updated);
  } catch (e) {
    if (e instanceof AuthError) return NextResponse.json({ error: e.message }, { status: e.status });
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}
