import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { assertPracticeAccess, assertPracticeUnlocked } from '@/lib/rbac';
import { errorResponse } from '@/lib/api';
import { DIMENSIONS } from '@/lib/types';
import { DIMENSION_MAX_SCORE } from '@/lib/audit-score';
import { canAccess } from '@/lib/access-policy';
import { writeAuditLog, extractRequestMeta } from '@/lib/audit-log';

/** 交易內偵測到已鎖定的訊號(rollback 後轉 409;與 audit/scores 的 ScoreLockedError 對齊)。 */
class PracticeLockedError extends Error {}

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
      return NextResponse.json({ error: '練習於實地稽核階段起開放(結案後仍可續寫)' }, { status: 403 });
    }
    await assertPracticeUnlocked(cycle.id, user.id); // 送出鎖定後不可再改(批45;快速失敗,鎖定再確認見下方交易)

    const body = Body.parse(await req.json());
    for (const s of body.scores) {
      const max = DIMENSION_MAX_SCORE[s.dimension];
      if (s.score !== null && s.score > max) {
        return NextResponse.json({ error: `「${s.dimension}」配分上限 ${max} 分` }, { status: 400 });
      }
    }

    // 鎖定檢查+寫入收進同一可序列化交易:防「檢查通過→寫入前」空檔被 practice-lock 設下 practiceLockedAt
    // (破壞剛驗證過的「至少一完整構面」;TOCTOU)。與 practice-lock 交易形成讀寫對,衝突方 PG 以 P2034 中止→409。
    // (與委員 audit/scores 對齊;批46 專審 P2 修。)
    try {
      await prisma.$transaction(async (tx) => {
        const o = await tx.cycleObserver.findUnique({
          where: { cycleId_observerId: { cycleId: cycle.id, observerId: user.id } },
          select: { practiceLockedAt: true },
        });
        if (o?.practiceLockedAt) throw new PracticeLockedError();
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
      }, { isolationLevel: 'Serializable' });
    } catch (e) {
      if (e instanceof PracticeLockedError) {
        return NextResponse.json({ error: '您已送出(確認填寫完畢),練習評分已鎖定;如需修改請先「解除鎖定」。' }, { status: 409 });
      }
      if ((e as { code?: string }).code === 'P2034') {
        return NextResponse.json({ error: '儲存衝突,請稍候重試。' }, { status: 409 });
      }
      throw e;
    }

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
