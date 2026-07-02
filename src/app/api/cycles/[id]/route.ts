import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { requireRole } from '@/lib/rbac';
import { errorResponse } from '@/lib/api';
import { writeAuditLog, extractRequestMeta } from '@/lib/audit-log';

const DateStr = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, '日期格式須為 YYYY-MM-DD');

const PatchBody = z.object({
  dueDate: DateStr.nullable().optional(),
  prepDueDate: DateStr.nullable().optional(),
  prepDueTech: DateStr.nullable().optional(),
  techCheckDate: DateStr.nullable().optional(),
  onsiteDate: DateStr.nullable().optional(),
});

/** 編輯週期日期(矯正截止/資料準備截止/實地稽核日)— SUPER_ADMIN 限定。 */
export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  try {
    const user = await requireRole('SUPER_ADMIN');
    const cycle = await prisma.auditCycle.findUnique({ where: { id: params.id } });
    if (!cycle) return NextResponse.json({ error: '稽核週期不存在' }, { status: 404 });
    if (cycle.status === 'CLOSED') {
      return NextResponse.json({ error: '已結案週期不可修改日期' }, { status: 400 });
    }

    const body = PatchBody.parse(await req.json());
    const toDate = (s: string) => new Date(`${s}T00:00:00+08:00`);

    const updated = await prisma.auditCycle.update({
      where: { id: cycle.id },
      data: {
        dueDate: body.dueDate === undefined ? undefined : body.dueDate ? toDate(body.dueDate) : null,
        prepDueDate:
          body.prepDueDate === undefined ? undefined : body.prepDueDate ? toDate(body.prepDueDate) : null,
        prepDueTech:
          body.prepDueTech === undefined ? undefined : body.prepDueTech ? toDate(body.prepDueTech) : null,
        techCheckDate:
          body.techCheckDate === undefined ? undefined : body.techCheckDate ? toDate(body.techCheckDate) : null,
        onsiteDate:
          body.onsiteDate === undefined ? undefined : body.onsiteDate ? toDate(body.onsiteDate) : null,
      },
    });

    const meta = extractRequestMeta(req);
    await writeAuditLog({
      actorId: user.id,
      action: 'CYCLE_UPDATE',
      entityType: 'AuditCycle',
      entityId: cycle.id,
      before: { dueDate: cycle.dueDate, prepDueDate: cycle.prepDueDate, onsiteDate: cycle.onsiteDate },
      after: { dueDate: updated.dueDate, prepDueDate: updated.prepDueDate, onsiteDate: updated.onsiteDate },
      ...meta,
    });

    return NextResponse.json({ item: updated });
  } catch (e) {
    return errorResponse(e);
  }
}

/**
 * 刪除稽核週期(建錯醫院/年度時使用)— SUPER_ADMIN 限定。
 * 僅「開立中(DRAFT)」可刪:尚未對機關開放、無任何填報內容;推進至資料準備後不可刪
 * (已有機關繳交紀錄,誤開請改用回退或聯繫維運)。關聯資料(需求清單/指派/精靈進度等)
 * 由 schema onDelete: Cascade 一併清除;EmailLog.relatedCycleId 為純字串不受影響。
 */
export async function DELETE(req: Request, { params }: { params: { id: string } }) {
  try {
    const user = await requireRole('SUPER_ADMIN');
    const cycle = await prisma.auditCycle.findUnique({
      where: { id: params.id },
      include: { organization: { select: { name: true } } },
    });
    if (!cycle) return NextResponse.json({ error: '稽核週期不存在' }, { status: 404 });
    if (cycle.status !== 'DRAFT') {
      return NextResponse.json(
        { error: '僅「開立中」的週期可刪除;已進入資料準備後不可刪(機關可能已有繳交紀錄)' },
        { status: 409 },
      );
    }

    await prisma.auditCycle.delete({ where: { id: cycle.id } });

    const meta = extractRequestMeta(req);
    await writeAuditLog({
      actorId: user.id,
      action: 'CYCLE_DELETE',
      entityType: 'AuditCycle',
      entityId: cycle.id,
      before: { organization: cycle.organization.name, year: cycle.year, status: cycle.status },
      ...meta,
    });

    return NextResponse.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
