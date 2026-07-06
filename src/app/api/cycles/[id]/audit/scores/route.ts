import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { assertCycleAccess, assertAuditorScoreUnlocked } from '@/lib/rbac';
import { errorResponse } from '@/lib/api';
import { DIMENSIONS, auditorCanScore } from '@/lib/types';
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

/** 交易內偵測到已鎖定的訊號(rollback 後轉 409) */
class ScoreLockedError extends Error {}

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
    // 階段閘下沉 API 層(縱深防禦):實地稽核(ONSITE 起)才可評分。
    // 原本僅 audit/page.tsx redirect 把關 → 受指派委員於 READY 可繞頁面直打此 API 寫評分(五鏡稽核 P0 破口)。
    if (!auditorCanScore(cycle.status)) {
      return NextResponse.json({ error: '尚未進入實地稽核階段,暫不可評分' }, { status: 403 });
    }
    await assertAuditorScoreUnlocked(cycle.id, user.id); // 已鎖定 → 擋下(快速失敗;交易內另權威重查)

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

    // 鎖定檢查+寫入收進同一可序列化交易:防止「檢查通過→寫入前」的空檔被 lock route
    // 設下 scoreLockedAt,導致鎖定後仍寫入(破壞鎖定閘剛驗證過的完整性;TOCTOU)。
    // 與 lock route 的交易形成讀寫對,衝突方由 PG 以 P2034 中止 → 回 409 請重試。
    try {
      await prisma.$transaction(async (tx) => {
        const a = await tx.auditorAssignment.findUnique({
          where: { cycleId_auditorId: { cycleId: cycle.id, auditorId: user.id } },
          select: { scoreLockedAt: true },
        });
        if (a?.scoreLockedAt) throw new ScoreLockedError();
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
            await tx.auditScore.deleteMany({
              where: { cycleId: cycle.id, auditorId: user.id, dimension: s.dimension },
            });
          } else {
            await tx.auditScore.upsert({
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
      }, { isolationLevel: 'Serializable' });
    } catch (e) {
      if (e instanceof ScoreLockedError) {
        return NextResponse.json({ error: '您已確認填寫完畢,評分已鎖定;如需修改請先「解除鎖定」。' }, { status: 409 });
      }
      if ((e as { code?: string }).code === 'P2034') {
        return NextResponse.json({ error: '儲存衝突,請稍候重試。' }, { status: 409 });
      }
      throw e;
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
