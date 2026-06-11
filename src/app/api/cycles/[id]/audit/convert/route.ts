import { NextResponse } from 'next/server';
import { assertCycleAccess, AuthError } from '@/lib/rbac';
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

    const converted = await convertFindingsToDeficiencies(cycle.id, user.id);

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
    if (e instanceof AuthError) return NextResponse.json({ error: e.message }, { status: e.status });
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
