import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { assertCycleAccess, AuthError } from '@/lib/rbac';
import { convertFindingsToDeficiencies } from '@/lib/convert-findings';
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

    // 1) 發現 → 缺失
    const converted = await convertFindingsToDeficiencies(cycle.id, user.id);

    const totalDeficiencies = await prisma.deficiency.count({ where: { cycleId: cycle.id } });
    if (totalDeficiencies === 0) {
      return NextResponse.json(
        { error: '沒有任何缺失可發布:請先請委員於「實地稽核」輸入待改善/建議事項' },
        { status: 400 },
      );
    }

    // 2) 狀態推進至 REMEDIATION(逐跳記錄)
    const path = PATH_TO_REMEDIATION[cycle.status as CycleStatus] ?? [];
    let from = cycle.status as CycleStatus;
    for (const to of path) {
      await prisma.auditCycle.update({
        where: { id: cycle.id },
        data: {
          status: to,
          stateTransitions: {
            create: { fromStatus: from, toStatus: to, actorId: user.id, reason: '已完成年度稽核(一鍵連動)' },
          },
        },
      });
      from = to;
    }

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
      console.error('[audit.finish] 通知失敗:', e);
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
    if (e instanceof AuthError) return NextResponse.json({ error: e.message }, { status: e.status });
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
