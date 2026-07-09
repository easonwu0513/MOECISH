import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { assertPracticeAccess } from '@/lib/rbac';
import { errorResponse } from '@/lib/api';
import { canAccess } from '@/lib/access-policy';
import { auditorScoringComplete } from '@/lib/audit-score';
import { writeAuditLog, extractRequestMeta } from '@/lib/audit-log';

const Body = z.object({ locked: z.boolean() });

/** 交易內驗證失敗訊號(rollback 後轉 400)。 */
class LockValidationError extends Error {}

/**
 * 觀察員「確認填寫完畢(送出)/解除鎖定」自己的練習評分與練習發現(批45;比照委員 audit/lock)。
 * - 送出(鎖定):practiceLockedAt = now;鎖定後練習評分/發現寫入 API 一律擋下(防繞過)。
 *   此練習第二階段作為指導委員評分之依據,故需一個明確「送出」點,而非只暫存。
 * - 解除:清除 practiceLockedAt;前端解鎖前要求觀察員勾選「已告知工作人員與指派的指導委員」。
 * 授權:僅觀察員本人(assertPracticeAccess viewerKind==='observer');階段=practice.access(ONSITE 起、結案鎖)。
 */
export async function POST(req: Request, { params }: { params: { id: string } }) {
  try {
    const { user, cycle, viewerKind } = await assertPracticeAccess(params.id);
    if (viewerKind !== 'observer' || user.role !== 'OBSERVER') {
      return NextResponse.json({ error: '僅觀察員本人可確認填寫完畢' }, { status: 403 });
    }
    // 結案後仍允許送出/解除練習(批49 圖2):練習隔離不影響正式結果;階段閘由 practice.access 統一(現含 CLOSED)。
    if (!canAccess('practice.access', 'OBSERVER', cycle.status)) {
      return NextResponse.json({ error: '尚未進入實地稽核階段,暫不可送出/解除練習' }, { status: 403 });
    }
    const pairing = await prisma.cycleObserver.findUnique({
      where: { cycleId_observerId: { cycleId: cycle.id, observerId: user.id } },
      select: { id: true },
    });
    if (!pairing) {
      return NextResponse.json({ error: '您未被配對至此稽核週期' }, { status: 403 });
    }
    const { locked } = Body.parse(await req.json());

    if (locked) {
      // 送出前置(比照委員):至少一個構面「完整」(有評分 + 判定數量四格合計===該構面題數)。
      // 驗證+設鎖包進可序列化交易,防「驗證後、鎖定前」在途的評分 PUT 把唯一完整構面改回不完整(TOCTOU)。
      try {
        await prisma.$transaction(async (tx) => {
          const [itemGroups, myScores] = await Promise.all([
            tx.checklistItem.groupBy({
              by: ['dimension'],
              where: { versionId: cycle.checklistVersionId },
              _count: { _all: true },
            }),
            tx.practiceScore.findMany({ where: { cycleId: cycle.id, observerId: user.id } }),
          ]);
          const totalByDim = new Map(itemGroups.map((g) => [g.dimension, g._count._all]));
          if (!auditorScoringComplete([], myScores, totalByDim)) {
            throw new LockValidationError('請至少完整填寫一個構面(評分,且判定數量合計等於該構面題數)後,再送出。');
          }
          await tx.cycleObserver.update({ where: { id: pairing.id }, data: { practiceLockedAt: new Date() } });
        }, { isolationLevel: 'Serializable' });
      } catch (e) {
        if (e instanceof LockValidationError) return NextResponse.json({ error: e.message }, { status: 400 });
        if ((e as { code?: string }).code === 'P2034') {
          return NextResponse.json({ error: '正在同步儲存練習評分,請稍候再按一次「送出」。' }, { status: 409 });
        }
        throw e;
      }
    } else {
      await prisma.cycleObserver.update({ where: { id: pairing.id }, data: { practiceLockedAt: null } });
    }

    await writeAuditLog({
      actorId: user.id,
      action: locked ? 'practice.score.lock' : 'practice.score.unlock',
      entityType: 'CycleObserver',
      entityId: pairing.id,
      after: { cycleId: cycle.id, locked },
      ...extractRequestMeta(req),
    });

    return NextResponse.json({ ok: true, locked });
  } catch (e) {
    return errorResponse(e);
  }
}
