import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { assertCycleAccess } from '@/lib/rbac';
import { errorResponse } from '@/lib/api';
import { writeAuditLog, extractRequestMeta } from '@/lib/audit-log';
import { checklistOrgCanEdit } from '@/lib/types';

/**
 * 一鍵將「未作答」項目全部標記(預設「不適用」,亦可指定「符合」)。
 * 只動未作答項,不覆寫既有作答。fill: 'NA'(預設) | 'COMPLIANT'。
 */
export async function POST(req: Request, { params }: { params: { id: string } }) {
  try {
    const body = await req.json().catch(() => ({}));
    const fill = (body as { fill?: string })?.fill === 'COMPLIANT' ? 'COMPLIANT' : 'NOT_APPLICABLE';
    const { user, cycle } = await assertCycleAccess(params.id);
    if (user.role !== 'ORG_ADMIN') {
      return NextResponse.json({ error: '僅機關管理員可操作' }, { status: 403 });
    }
    if (!checklistOrgCanEdit(cycle.status)) {
      return NextResponse.json({ error: '需於「資料準備中」階段才能填報(開立中尚未開放)' }, { status: 400 });
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

    // 整批包進單一交易:中途失敗則全數回滾,不留半套作答
    const updated = await prisma.$transaction(async (tx) => {
      let n = 0;
      for (const it of targets) {
        await tx.checklistResponse.upsert({
          where: { cycleId_checklistItemId: { cycleId: cycle.id, checklistItemId: it.id } },
          create: {
            cycleId: cycle.id,
            checklistItemId: it.id,
            compliance: fill,
            version: 1,
            lastEditorId: user.id,
            lastEditedAt: new Date(),
          },
          update: {
            compliance: fill,
            version: { increment: 1 },
            lastEditorId: user.id,
            lastEditedAt: new Date(),
          },
        });
        n++;
      }
      return n;
    });

    const meta = extractRequestMeta(req);
    await writeAuditLog({
      actorId: user.id,
      action: 'CHECKLIST_BULK_FILL',
      entityType: 'AuditCycle',
      entityId: cycle.id,
      after: { updated, fill },
      ...meta,
    });

    return NextResponse.json({ updated, fill });
  } catch (e) {
    return errorResponse(e);
  }
}
