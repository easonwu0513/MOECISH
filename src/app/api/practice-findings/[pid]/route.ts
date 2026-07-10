import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { requireRole, AuthError, assertPracticeUnlocked } from '@/lib/rbac';
import { errorResponse } from '@/lib/api';
import { DEFICIENCY_ASPECTS } from '@/lib/types';
import { canAccess } from '@/lib/access-policy';
import { FINDING_KINDS } from '@/lib/audit-score';
import { toFullWidthPunct } from '@/lib/fullwidth-punct';
import { writeAuditLog, extractRequestMeta } from '@/lib/audit-log';

// 練習發現單條編修(批30):僅「作者觀察員本人」可改/刪;階段閘同新增(ONSITE 起、結案鎖定)。
// 中心/指導委員為唯讀(回饋走 feedback 端點),機關完全不可見。
async function loadOwnPractice(pid: string, userId: string) {
  const pf = await prisma.practiceFinding.findUnique({
    where: { id: pid },
    include: { cycle: { select: { id: true, status: true } } },
  });
  if (!pf) throw new AuthError(404, '練習發現不存在');
  if (pf.observerId !== userId) throw new AuthError(403, '僅能編修自己的練習發現');
  await assertPracticeUnlocked(pf.cycleId, userId); // 送出鎖定後不可再改/刪(批45)
  if (!canAccess('practice.access', 'OBSERVER', pf.cycle.status)) {
    throw new AuthError(403, '練習於實地稽核階段起開放(結案後仍可續寫)');
  }
  return pf;
}

const PatchBody = z.object({
  aspect: z.enum(DEFICIENCY_ASPECTS).optional(),
  kind: z.enum(FINDING_KINDS).optional(),
  content: z.string().trim().min(5, '練習內容至少 5 字').optional(),
  checklistRef: z.string().trim().max(50).nullable().optional(),
});

export async function PATCH(req: Request, { params }: { params: { pid: string } }) {
  try {
    const user = await requireRole('OBSERVER');
    const body = PatchBody.parse(await req.json());
    const pf = await loadOwnPractice(params.pid, user.id);

    // 鎖定重查+更新收進同一可序列化交易(TOCTOU 防護,鏡射 practice-scores):
    // loadOwnPractice 的 assertPracticeUnlocked 為快速失敗,交易內再查一次以對齊 practice-lock 讀寫對。
    let updated;
    try {
      updated = await prisma.$transaction(async (tx) => {
        const o = await tx.cycleObserver.findUnique({
          where: { cycleId_observerId: { cycleId: pf.cycleId, observerId: user.id } },
          select: { practiceLockedAt: true },
        });
        if (o?.practiceLockedAt) throw new AuthError(409, '已送出(確認填寫完畢),如需修改請先解除鎖定');
        return tx.practiceFinding.update({
          where: { id: pf.id },
          data: {
            aspect: body.aspect ?? undefined,
            kind: body.kind ?? undefined,
            content: body.content !== undefined ? toFullWidthPunct(body.content) : undefined,
            checklistRef: body.checklistRef === undefined ? undefined : body.checklistRef || null,
          },
        });
      }, { isolationLevel: 'Serializable' });
    } catch (e) {
      if ((e as { code?: string }).code === 'P2034') {
        return NextResponse.json({ error: '儲存衝突,請稍候重試。' }, { status: 409 });
      }
      throw e;
    }

    await writeAuditLog({
      actorId: user.id,
      action: 'PRACTICE_FINDING_UPDATE',
      entityType: 'PracticeFinding',
      entityId: updated.id,
      ...extractRequestMeta(req),
    });

    return NextResponse.json(updated);
  } catch (e) {
    return errorResponse(e);
  }
}

export async function DELETE(req: Request, { params }: { params: { pid: string } }) {
  try {
    const user = await requireRole('OBSERVER');
    const pf = await loadOwnPractice(params.pid, user.id);

    // 鎖定重查+刪除收進同一可序列化交易(TOCTOU 防護,鏡射 practice-scores)。
    try {
      await prisma.$transaction(async (tx) => {
        const o = await tx.cycleObserver.findUnique({
          where: { cycleId_observerId: { cycleId: pf.cycleId, observerId: user.id } },
          select: { practiceLockedAt: true },
        });
        if (o?.practiceLockedAt) throw new AuthError(409, '已送出(確認填寫完畢),如需修改請先解除鎖定');
        await tx.practiceFinding.delete({ where: { id: pf.id } });
      }, { isolationLevel: 'Serializable' });
    } catch (e) {
      if ((e as { code?: string }).code === 'P2034') {
        return NextResponse.json({ error: '儲存衝突,請稍候重試。' }, { status: 409 });
      }
      throw e;
    }

    await writeAuditLog({
      actorId: user.id,
      action: 'PRACTICE_FINDING_DELETE',
      entityType: 'PracticeFinding',
      entityId: pf.id,
      before: { content: pf.content, aspect: pf.aspect, kind: pf.kind },
      ...extractRequestMeta(req),
    });

    return NextResponse.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
