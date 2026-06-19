import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { assertCycleAccess } from '@/lib/rbac';
import { errorResponse } from '@/lib/api';
import { DIMENSIONS } from '@/lib/types';
import { DIMENSION_MAX_SCORE } from '@/lib/audit-score';
import { writeAuditLog, extractRequestMeta } from '@/lib/audit-log';

const Body = z.object({
  scores: z.array(
    z.object({
      dimension: z.enum(DIMENSIONS),
      score: z.number().int().min(0).nullable(),
    }),
  ).min(1),
});

/** 受指派委員批次儲存自己的九項評分(null = 清除該項)。 */
export async function PUT(req: Request, { params }: { params: { id: string } }) {
  try {
    const { user, cycle } = await assertCycleAccess(params.id);
    if (user.role !== 'AUDITOR') {
      return NextResponse.json({ error: '僅稽核委員可評分' }, { status: 403 });
    }
    if (cycle.status === 'CLOSED') {
      return NextResponse.json({ error: '已結案的週期不可再評分' }, { status: 409 });
    }

    const body = Body.parse(await req.json());
    for (const s of body.scores) {
      const max = DIMENSION_MAX_SCORE[s.dimension];
      if (s.score !== null && s.score > max) {
        return NextResponse.json(
          { error: `「${s.dimension}」配分上限 ${max} 分` },
          { status: 400 },
        );
      }
    }

    for (const s of body.scores) {
      if (s.score === null) {
        await prisma.auditScore.deleteMany({
          where: { cycleId: cycle.id, auditorId: user.id, dimension: s.dimension },
        });
      } else {
        await prisma.auditScore.upsert({
          where: {
            cycleId_auditorId_dimension: {
              cycleId: cycle.id, auditorId: user.id, dimension: s.dimension,
            },
          },
          create: { cycleId: cycle.id, auditorId: user.id, dimension: s.dimension, score: s.score },
          update: { score: s.score },
        });
      }
    }

    await writeAuditLog({
      actorId: user.id,
      action: 'audit.score',
      entityType: 'AuditCycle',
      entityId: cycle.id,
      after: Object.fromEntries(body.scores.map((s) => [s.dimension, s.score])),
      ...extractRequestMeta(req),
    });

    return NextResponse.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
