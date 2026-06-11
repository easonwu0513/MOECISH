import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { assertCycleAccess, AuthError } from '@/lib/rbac';
import { writeAuditLog, extractRequestMeta } from '@/lib/audit-log';

/**
 * 一鍵把彙整報告中的「待改善/建議」轉入缺失管考(SUPER_ADMIN):
 * - 只轉尚未轉過的(deficiencyId 為空)
 * - 法遵符合情形(COMPLIANCE)不轉(正面表列,無矯正需求)
 * - 項次依構面×類型自動接續編號;轉後回填 deficiencyId 鎖定原發現
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

    const pending = await prisma.auditFinding.findMany({
      where: {
        cycleId: cycle.id,
        deficiencyId: null,
        kind: { in: ['IMPROVE', 'SUGGEST'] },
      },
      orderBy: [{ aspect: 'asc' }, { kind: 'asc' }, { createdAt: 'asc' }],
    });
    if (pending.length === 0) {
      return NextResponse.json({ ok: true, converted: 0 });
    }

    // 既有缺失的各組最大項次
    const existing = await prisma.deficiency.groupBy({
      by: ['aspect', 'type'],
      where: { cycleId: cycle.id },
      _max: { itemNo: true },
    });
    const nextNo = new Map<string, number>();
    for (const g of existing) {
      nextNo.set(`${g.aspect}:${g.type}`, (g._max.itemNo ?? 0) + 1);
    }

    let converted = 0;
    for (const f of pending) {
      const key = `${f.aspect}:${f.kind}`;
      const itemNo = nextNo.get(key) ?? 1;
      nextNo.set(key, itemNo + 1);

      const def = await prisma.deficiency.create({
        data: {
          cycleId: cycle.id,
          aspect: f.aspect,
          type: f.kind, // IMPROVE / SUGGEST 與 DeficiencyType 同值
          itemNo,
          description: f.content,
          checklistRef: f.checklistRef,
          createdById: user.id,
        },
      });
      await prisma.auditFinding.update({
        where: { id: f.id },
        data: { deficiencyId: def.id },
      });
      converted++;
    }

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
