import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { assertCycleAccess } from '@/lib/rbac';
import { errorResponse } from '@/lib/api';
import { convertFindingsToDeficiencies } from '@/lib/convert-findings';
import { writeAuditLog, extractRequestMeta } from '@/lib/audit-log';

/**
 * 一鍵把彙整報告中的「待改善/建議」轉入缺失管考(SUPER_ADMIN):
 * 核心邏輯在 lib/convert-findings(與「已完成年度稽核」共用)。
 */
export async function POST(req: Request, { params }: { params: { id: string } }) {
  try {
    const { user, cycle } = await assertCycleAccess(params.id);
    if (user.role !== 'SUPER_ADMIN') {
      return NextResponse.json({ error: '僅最高管理員可轉入缺失管考' }, { status: 403 });
    }
    if (cycle.status === 'CLOSED') {
      return NextResponse.json({ error: '已結案的週期不可新增缺失' }, { status: 409 });
    }

    // 逐筆 create + 回填以單一交易包覆(中途失敗整批回滾)
    const converted = await prisma.$transaction((tx) =>
      convertFindingsToDeficiencies(cycle.id, user.id, tx),
    );

    await writeAuditLog({
      actorId: user.id,
      action: 'audit.findings.convert',
      entityType: 'AuditCycle',
      entityId: cycle.id,
      after: { converted },
      ...extractRequestMeta(req),
    });

    return NextResponse.json({ ok: true, converted });
  } catch (e) {
    return errorResponse(e);
  }
}
