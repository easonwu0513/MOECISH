import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { assertCycleAccess } from '@/lib/rbac';
import { errorResponse } from '@/lib/api';
import { writeAuditLog, extractRequestMeta } from '@/lib/audit-log';
import { notifyAuditScoreLocked, notifyAuditScoreUnlocked } from '@/lib/notify';
import { appBaseUrl } from '@/lib/baseUrl';
import { ASPECT_DIMENSIONS, ASSIGN_TO_ASPECT, DIMENSION_NUM, parseAssignDimensions } from '@/lib/audit-score';
import type { DeficiencyAspect, Dimension } from '@/lib/types';

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
    const assignment = await prisma.auditorAssignment.findUnique({
      where: { cycleId_auditorId: { cycleId: cycle.id, auditorId: user.id } },
    });
    if (!assignment) {
      return NextResponse.json({ error: '您未被指派此稽核週期' }, { status: 403 });
    }
    const { locked } = Body.parse(await req.json());

    // 鎖定(確認填寫完畢)前置:評分表須填寫完整(UAT 批63;前端同規則即時回饋,此為權威閘)——
    // 範圍=負責構面(未指定=全構面)∪ 任何已動筆的構面;每構面:評分必填、
    // 「委員判定數量」四格合計須等於該構面檢核題數。
    // 驗證+設鎖包進可序列化交易:防「驗證後、鎖定前」在途的評分 PUT 把資料改回不完整
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
          const scoreByDim = new Map(myScores.map((s) => [s.dimension, s]));
          const focusAspects = new Set<DeficiencyAspect>(
            parseAssignDimensions(assignment.dimensions).map((a) => ASSIGN_TO_ASPECT[a]),
          );
          const aspects: DeficiencyAspect[] = focusAspects.size > 0
            ? [...focusAspects]
            : ['STRATEGY', 'MANAGEMENT', 'TECHNICAL'];
          const mustDims = new Set<string>(aspects.flatMap((a) => ASPECT_DIMENSIONS[a]));
          for (const s of myScores) {
            if (s.score != null || s.cntComply != null || s.cntPartial != null || s.cntNonComply != null || s.cntNa != null) {
              mustDims.add(s.dimension);
            }
          }
          const problems: string[] = [];
          for (const d of mustDims) {
            const total = totalByDim.get(d) ?? 0;
            const s = scoreByDim.get(d);
            const untouched = s == null || (s.cntComply == null && s.cntPartial == null && s.cntNonComply == null && s.cntNa == null);
            const sum = (s?.cntComply ?? 0) + (s?.cntPartial ?? 0) + (s?.cntNonComply ?? 0) + (s?.cntNa ?? 0);
            const issues: string[] = [];
            if (s?.score == null) issues.push('未填評分');
            // 四格全空=「未填」而非「合計 0」(誠實區分沒動筆與填了 0)
            if (sum !== total) issues.push(untouched ? `未填判定數量(應合計 ${total})` : `判定數量合計 ${sum},應為 ${total}`);
            if (issues.length) problems.push(`構面${DIMENSION_NUM[d as Dimension] ?? d} ${issues.join('、')}`);
          }
          if (problems.length > 0) {
            const helpNote = focusAspects.size === 0 ? '(未指派負責構面時須評滿全部構面;如僅負責部分構面,請洽中心於委員指派設定)' : '';
            throw new LockValidationError(
              `評分表尚未填寫完整,無法確認填寫完畢:${problems.slice(0, 4).join(';')}${problems.length > 4 ? `…等共 ${problems.length} 個構面待補` : ''}${helpNote}`,
            );
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
          return NextResponse.json({ error: '正在同步儲存評分,請稍候再按一次「確認填寫完畢」。' }, { status: 409 });
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
      console.error('[audit.lock] 通知失敗:', e);
    }

    return NextResponse.json({ ok: true, locked, notified });
  } catch (e) {
    return errorResponse(e);
  }
}
