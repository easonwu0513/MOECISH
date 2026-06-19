import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { assertCycleAccess, AuthError } from '@/lib/rbac';
import { writeAuditLog, extractRequestMeta } from '@/lib/audit-log';

/**
 * 一鍵將「未作答」項目全部標為符合(機關先全選符合、再逐題調整例外)。
 * 只動未作答項,不覆寫既有作答。
 */
export async function POST(req: Request, { params }: { params: { id: string } }) {
  try {
    const { user, cycle } = await assertCycleAccess(params.id);
    if (user.role !== 'ORG_ADMIN') {
      return NextResponse.json({ error: '僅機關管理員可操作' }, { status: 403 });
    }
    if (cycle.status !== 'DRAFT' && cycle.status !== 'PREPARATION') {
      return NextResponse.json({ error: '目前狀態不可編輯' }, { status: 400 });
    }
    if (cycle.checklistSubmittedAt) {
      return NextResponse.json(
        { error: '填報已送出鎖定,如需修改請洽稽核委員退回重填' },
        { status: 409 },
      );
    }

    const items = await prisma.checklistItem.findMany({
      where: { versionId: cycle.checklistVersionId },
      select: { id: true },
    });
    const answered = await prisma.checklistResponse.findMany({
      where: { cycleId: cycle.id, compliance: { not: null } },
      select: { checklistItemId: true },
    });
    const answeredSet = new Set(answered.map((r) => r.checklistItemId));
    const targets = items.filter((i) => !answeredSet.has(i.id));

    let updated = 0;
    for (const it of targets) {
      await prisma.checklistResponse.upsert({
        where: { cycleId_checklistItemId: { cycleId: cycle.id, checklistItemId: it.id } },
        create: {
          cycleId: cycle.id,
          checklistItemId: it.id,
          compliance: 'COMPLIANT',
          version: 1,
          lastEditorId: user.id,
          lastEditedAt: new Date(),
        },
        update: {
          compliance: 'COMPLIANT',
          version: { increment: 1 },
          lastEditorId: user.id,
          lastEditedAt: new Date(),
        },
      });
      updated++;
    }

    const meta = extractRequestMeta(req);
    await writeAuditLog({
      actorId: user.id,
      action: 'CHECKLIST_BULK_COMPLIANT',
      entityType: 'AuditCycle',
      entityId: cycle.id,
      after: { updated },
      ...meta,
    });

    return NextResponse.json({ updated });
  } catch (e) {
    if (e instanceof AuthError) return NextResponse.json({ error: e.message }, { status: e.status });
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}
