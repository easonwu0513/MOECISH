import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { assertPracticeAccess } from '@/lib/rbac';
import { errorResponse } from '@/lib/api';
import { DIMENSIONS } from '@/lib/types';
import { DIMENSION_MAX_SCORE } from '@/lib/audit-score';
import { canAccess } from '@/lib/access-policy';
import { writeAuditLog, extractRequestMeta } from '@/lib/audit-log';

const cnt = z.number().int().min(0).max(999).nullable().optional();
const Body = z.object({
  scores: z.array(
    z.object({
      dimension: z.enum(DIMENSIONS),
      score: z.number().int().min(0).nullable(),
      cntComply: cnt,
      cntPartial: cnt,
      cntNonComply: cnt,
      cntNa: cnt,
    }),
  ).min(1),
});

/**
 * 練習評分(批42):觀察員以附件17 同款評分表練習打分,存獨立 PracticeScore 表——
 * 彙整/列印/報告消費端只讀 AuditScore,本表結構性保證絕不進正式結果(比照 PracticeFinding)。
 * 授權:僅觀察員本人;階段閘同練習發現(practice.access:ONSITE 起、結案鎖定)。無「確認填寫完畢」鎖定概念。
 */
export async function PUT(req: Request, { params }: { params: { id: string } }) {
  try {
    const { user, cycle } = await assertPracticeAccess(params.id);
    if (user.role !== 'OBSERVER') {
      return NextResponse.json({ error: '僅觀察員本人可填寫練習評分' }, { status: 403 });
    }
    if (!canAccess('practice.access', 'OBSERVER', cycle.status)) {
      return NextResponse.json({ error: '練習於實地稽核階段開放(結案後鎖定)' }, { status: 403 });
    }

    const body = Body.parse(await req.json());
    for (const s of body.scores) {
      const max = DIMENSION_MAX_SCORE[s.dimension];
      if (s.score !== null && s.score > max) {
        return NextResponse.json({ error: `「${s.dimension}」配分上限 ${max} 分` }, { status: 400 });
      }
    }

    await prisma.$transaction(async (tx) => {
      for (const s of body.scores) {
        const counts = {
          cntComply: s.cntComply ?? null,
          cntPartial: s.cntPartial ?? null,
          cntNonComply: s.cntNonComply ?? null,
          cntNa: s.cntNa ?? null,
        };
        const hasAny =
          s.score !== null ||
          counts.cntComply !== null || counts.cntPartial !== null ||
          counts.cntNonComply !== null || counts.cntNa !== null;
        if (!hasAny) {
          await tx.practiceScore.deleteMany({
            where: { cycleId: cycle.id, observerId: user.id, dimension: s.dimension },
          });
        } else {
          await tx.practiceScore.upsert({
            where: {
              cycleId_observerId_dimension: {
                cycleId: cycle.id, observerId: user.id, dimension: s.dimension,
              },
            },
            create: { cycleId: cycle.id, observerId: user.id, dimension: s.dimension, score: s.score, ...counts },
            update: { score: s.score, ...counts },
          });
        }
      }
    });

    await writeAuditLog({
      actorId: user.id,
      action: 'PRACTICE_SCORE_SAVE',
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
