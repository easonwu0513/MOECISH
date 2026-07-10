import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { assertCycleAccess } from '@/lib/rbac';
import { errorResponse } from '@/lib/api';
import { auditorCanScore } from '@/lib/types';
import { auditorScoringComplete } from '@/lib/audit-score';
import { writeAuditLog, extractRequestMeta } from '@/lib/audit-log';
import { notifyAuditScoreLocked, notifyAuditScoreUnlocked } from '@/lib/notify';
import { appBaseUrl } from '@/lib/baseUrl';

const Body = z.object({ locked: z.boolean() });

/** 交易內驗證失敗的訊號(rollback 後轉 400,與 P2034 序列化衝突分流) */
class LockValidationError extends Error {}

/**
 * 委員「確認填寫完畢(鎖定)」/「解除鎖定」自己的實地稽核評分與發現。
 * - 鎖定:scoreLockedAt = now;鎖定後 scores / findings 編輯 API 一律擋下(防繞過)。
 * - 解除:清除 scoreLockedAt,並通知最高管理員有內容異動(同時寫稽核軌跡)。
 */
export async function POST(req: Request, { params }: { params: { id: string } }) {
  try {
    const { user, cycle } = await assertCycleAccess(params.id); // AUDITOR 限被指派
    if (user.role !== 'AUDITOR') {
      return NextResponse.json({ error: '僅稽核委員可確認填寫完畢' }, { status: 403 });
    }
    if (cycle.status === 'CLOSED') {
      return NextResponse.json({ error: '已結案的週期不可變更' }, { status: 409 });
    }
    // 階段閘下沉 API 層(縱深防禦):實地稽核(ONSITE 起)才可鎖定/解鎖評分(封 READY 繞頁面直打)。
    if (!auditorCanScore(cycle.status)) {
      return NextResponse.json({ error: '尚未進入實地稽核階段，暫不可鎖定/解除評分' }, { status: 403 });
    }
    const assignment = await prisma.auditorAssignment.findUnique({
      where: { cycleId_auditorId: { cycleId: cycle.id, auditorId: user.id } },
    });
    if (!assignment) {
      return NextResponse.json({ error: '您未被指派此稽核週期' }, { status: 403 });
    }
    const { locked } = Body.parse(await req.json());

    // 鎖定(確認填寫完畢)前置軟性下限(批64):委員端只要求「至少一個構面完整」(有評分 + 委員判定數量
    // 四格合計等於該構面題數)即可定稿,分工下不強制填滿責任/全部構面;其餘「動過但沒填完」的構面由前端
    // 確認視窗提示,委員自行決定是否仍要送出。★「責任構面是否真的評完」的權威把關在中心「完成年度稽核/推進
    //   REPORT_ISSUED」閘(auditorsFinalized 依責任構面重新驗算),刻意不在此逐責任構面硬擋,避免與批64
    //   前端軟送出視窗(「仍要送出並鎖定」)衝突造成點了才吃 400。auditorScoringComplete([]) 即「至少一構面完整」。
    // 驗證+設鎖包進可序列化交易:防「驗證後、鎖定前」在途的評分 PUT 把唯一完整構面改回不完整
    // (check-then-act TOCTOU,與批54 check-then-delete 同類;scores PUT 亦已交易化,衝突方 P2034 重試/409)。
    if (locked) {
      try {
        await prisma.$transaction(async (tx) => {
          const [itemGroups, myScores] = await Promise.all([
            tx.checklistItem.groupBy({
              by: ['dimension'],
              where: { versionId: cycle.checklistVersionId },
              _count: { _all: true },
            }),
            tx.auditScore.findMany({ where: { cycleId: cycle.id, auditorId: user.id } }),
          ]);
          const totalByDim = new Map(itemGroups.map((g) => [g.dimension, g._count._all]));
          if (!auditorScoringComplete([], myScores, totalByDim)) {
            throw new LockValidationError('請至少完整填寫一個構面（評分，且委員判定數量合計等於該構面題數）後，再確認填寫完畢。');
          }
          await tx.auditorAssignment.update({
            where: { id: assignment.id },
            data: { scoreLockedAt: new Date() },
          });
        }, { isolationLevel: 'Serializable' });
      } catch (e) {
        if (e instanceof LockValidationError) {
          return NextResponse.json({ error: e.message }, { status: 400 });
        }
        // 可序列化衝突(同時有評分寫入)→ 請重試,避免鎖入未驗證資料
        if ((e as { code?: string }).code === 'P2034') {
          return NextResponse.json({ error: '正在同步儲存評分，請稍候再按一次「確認填寫完畢」。' }, { status: 409 });
        }
        throw e;
      }
    } else {
      await prisma.auditorAssignment.update({
        where: { id: assignment.id },
        data: { scoreLockedAt: null },
      });
    }

    await writeAuditLog({
      actorId: user.id,
      action: locked ? 'audit.score.lock' : 'audit.score.unlock',
      entityType: 'AuditorAssignment',
      entityId: assignment.id,
      after: { cycleId: cycle.id, locked },
      ...extractRequestMeta(req),
    });

    // 通知最高管理員:鎖定(委員已定稿)/ 解除鎖定(內容異動)。失敗不擋操作。
    let notified = 0;
    try {
      const r = locked
        ? await notifyAuditScoreLocked({ cycleId: cycle.id, auditorName: user.name, appBaseUrl: appBaseUrl(req) })
        : await notifyAuditScoreUnlocked({ cycleId: cycle.id, auditorName: user.name, appBaseUrl: appBaseUrl(req) });
      notified = r.recipientCount;
    } catch (e) {
      console.error('[audit.lock] 通知失敗：', e);
    }

    return NextResponse.json({ ok: true, locked, notified });
  } catch (e) {
    return errorResponse(e);
  }
}
