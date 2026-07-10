import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { assertCycleAccess } from '@/lib/rbac';
import { errorResponse } from '@/lib/api';
import { convertFindingsToDeficiencies, PlaceholderFindingsError } from '@/lib/convert-findings';
import { auditorsFinalized } from '@/lib/audit-finalize';
import { notifyCycleOrgAdmins } from '@/lib/notify';
import { appBaseUrl } from '@/lib/baseUrl';
import { writeAuditLog, extractRequestMeta } from '@/lib/audit-log';
import type { CycleStatus } from '@/lib/types';

/** 各狀態到 REMEDIATION 的推進鏈(沿既有狀態機路徑,逐跳留紀錄)。 */
const PATH_TO_REMEDIATION: Partial<Record<CycleStatus, CycleStatus[]>> = {
  DRAFT: ['REPORT_ISSUED', 'REMEDIATION'],
  PREPARATION: ['READY', 'ONSITE', 'REPORT_ISSUED', 'REMEDIATION'],
  READY: ['ONSITE', 'REPORT_ISSUED', 'REMEDIATION'],
  ONSITE: ['REPORT_ISSUED', 'REMEDIATION'],
  REPORT_ISSUED: ['REMEDIATION'],
  REMEDIATION: [],
};

/**
 * 「已完成年度稽核」一鍵連動(SUPER_ADMIN):
 * 1. 全體委員的「待改善/建議」發現 → 自動建立完整稽核缺失表
 * 2. 週期狀態沿狀態機推進至「矯正執行中(REMEDIATION)」,逐跳留軌跡
 * 3. 通知機關管理員:缺失已發布,請開始填報矯正措施
 */
export async function POST(req: Request, { params }: { params: { id: string } }) {
  try {
    const { user, cycle } = await assertCycleAccess(params.id);
    if (user.role !== 'SUPER_ADMIN') {
      return NextResponse.json({ error: '僅最高管理員可完成年度稽核' }, { status: 403 });
    }
    if (cycle.status === 'CLOSED') {
      return NextResponse.json({ error: '週期已結案' }, { status: 409 });
    }

    // 0) 前置:全體委員評分表須定稿(與手動 transition 至 REPORT_ISSUED 共用 auditorsFinalized,避免兩路徑不一致被繞過)
    const finalized = await auditorsFinalized(cycle.id);
    if (!finalized.ok) {
      return NextResponse.json({ error: finalized.error }, { status: 400 });
    }

    // 0.5) 前置:矯正截止日須先設定(本動作會進入矯正執行中,機關依此截止日填報;批48 圖8)。
    //      前端 FinishButton 亦先跳窗要求設定;此為後端縱深防禦,避免繞過。
    if (!cycle.dueDate) {
      return NextResponse.json(
        { error: '尚未設定矯正截止日，無法完成年度稽核；請先於週期首頁「編輯日期」設定矯正截止日。' },
        { status: 400 },
      );
    }

    // 1) 前置:確認有可發布的缺失(待轉發現或既有缺失),否則不啟動(不進交易)
    const pendingFindings = await prisma.auditFinding.count({
      where: { cycleId: cycle.id, deficiencyId: null, kind: { in: ['IMPROVE', 'SUGGEST'] } },
    });
    const existingDeficiencies = await prisma.deficiency.count({ where: { cycleId: cycle.id } });
    if (pendingFindings === 0 && existingDeficiencies === 0) {
      return NextResponse.json(
        { error: '沒有任何缺失可發布：請先請委員於「實地稽核」輸入待改善事項與建議事項' },
        { status: 400 },
      );
    }

    // 2) 轉缺失 + 多跳狀態推進:單一交易確保原子性(中途失敗整批回滾,不卡中間狀態)
    const { converted, totalDeficiencies } = await prisma.$transaction(async (tx) => {
      const conv = await convertFindingsToDeficiencies(cycle.id, user.id, tx);
      const total = await tx.deficiency.count({ where: { cycleId: cycle.id } });
      const path = PATH_TO_REMEDIATION[cycle.status as CycleStatus] ?? [];
      let from = cycle.status as CycleStatus;
      for (const to of path) {
        await tx.auditCycle.update({
          where: { id: cycle.id },
          data: {
            status: to,
            stateTransitions: {
              create: { fromStatus: from, toStatus: to, actorId: user.id, reason: '已完成年度稽核（一鍵連動）' },
            },
          },
        });
        from = to;
      }
      return { converted: conv, totalDeficiencies: total };
    });

    // 3) 通知機關開始矯正填報(失敗不擋流程)
    let notified = 0;
    try {
      const r = await notifyCycleOrgAdmins({
        cycleId: cycle.id,
        triggeredById: user.id,
        appBaseUrl: appBaseUrl(req),
      });
      notified = r.recipientCount;
    } catch (e) {
      console.error('[audit.finish] 通知失敗：', e);
    }

    await writeAuditLog({
      actorId: user.id,
      action: 'audit.finish',
      entityType: 'AuditCycle',
      entityId: cycle.id,
      before: { status: cycle.status },
      after: { status: 'REMEDIATION', converted, totalDeficiencies, notified },
      ...extractRequestMeta(req),
    });

    return NextResponse.json({
      ok: true,
      converted,
      totalDeficiencies,
      status: 'REMEDIATION',
      notified,
    });
  } catch (e) {
    // 佔位發現擋轉(批36):交易已整批回滾,以 400 回明確清單訊息供中心催補
    if (e instanceof PlaceholderFindingsError) {
      return NextResponse.json({ error: e.message }, { status: 400 });
    }
    return errorResponse(e);
  }
}
