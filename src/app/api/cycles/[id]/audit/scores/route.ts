import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { assertCycleAccess, assertAuditorScoreUnlocked } from '@/lib/rbac';
import { errorResponse } from '@/lib/api';
import { DIMENSIONS } from '@/lib/types';
import { DIMENSION_MAX_SCORE } from '@/lib/audit-score';
import { writeAuditLog, extractRequestMeta } from '@/lib/audit-log';

const cnt = z.number().int().min(0).max(999).nullable().optional();
const Body = z.object({
  scores: z.array(
    z.object({
      dimension: z.enum(DIMENSIONS),
      score: z.number().int().min(0).nullable(),
      // 委員手填之檢核結果數量(預設空白;不再自動帶機關自評)
      cntComply: cnt,
      cntPartial: cnt,
      cntNonComply: cnt,
      cntNa: cnt,
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
    await assertAuditorScoreUnlocked(cycle.id, user.id); // 已鎖定 → 擋下

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
      const counts = {
        cntComply: s.cntComply ?? null,
        cntPartial: s.cntPartial ?? null,
        cntNonComply: s.cntNonComply ?? null,
        cntNa: s.cntNa ?? null,
      };
      // 該構面有評分或有任一檢核數量 → 保留;全空 → 刪除該列
      const hasAny =
        s.score !== null ||
        counts.cntComply !== null || counts.cntPartial !== null ||
        counts.cntNonComply !== null || counts.cntNa !== null;
      if (!hasAny) {
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
          create: { cycleId: cycle.id, auditorId: user.id, dimension: s.dimension, score: s.score, ...counts },
          update: { score: s.score, ...counts },
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
