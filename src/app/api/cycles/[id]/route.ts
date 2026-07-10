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
  // 委員審閱時間區間(UAT 批67):日粒度,start 取當日 00:00、end 取當日 23:59:59(含當日)
  reviewWindowStart: DateStr.nullable().optional(),
  reviewWindowEnd: DateStr.nullable().optional(),
  // 觀察員獨立審閱窗口(批30):語義同委員窗口
  observerWindowStart: DateStr.nullable().optional(),
  observerWindowEnd: DateStr.nullable().optional(),
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
    const toDateEnd = (s: string) => new Date(`${s}T23:59:59+08:00`); // 審閱窗口迄=當日結束(含當日)

    // 審閱時間區間順序驗證:兩端同時提供(且皆非清空)時,迄不可早於起
    // (以「套用後的最終值」判定:未提供的沿用現值,提供 null=清空該端)
    const finalWStart = body.reviewWindowStart === undefined ? cycle.reviewWindowStart : (body.reviewWindowStart ? toDate(body.reviewWindowStart) : null);
    const finalWEnd = body.reviewWindowEnd === undefined ? cycle.reviewWindowEnd : (body.reviewWindowEnd ? toDateEnd(body.reviewWindowEnd) : null);
    if (finalWStart && finalWEnd && finalWEnd.getTime() < finalWStart.getTime()) {
      return NextResponse.json({ error: '審閱區間的截止不可早於開始' }, { status: 400 });
    }
    const finalOWStart = body.observerWindowStart === undefined ? cycle.observerWindowStart : (body.observerWindowStart ? toDate(body.observerWindowStart) : null);
    const finalOWEnd = body.observerWindowEnd === undefined ? cycle.observerWindowEnd : (body.observerWindowEnd ? toDateEnd(body.observerWindowEnd) : null);
    if (finalOWStart && finalOWEnd && finalOWEnd.getTime() < finalOWStart.getTime()) {
      return NextResponse.json({ error: '觀察員審閱區間的截止不可早於開始' }, { status: 400 });
    }

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
        reviewWindowStart:
          body.reviewWindowStart === undefined ? undefined : body.reviewWindowStart ? toDate(body.reviewWindowStart) : null,
        reviewWindowEnd:
          body.reviewWindowEnd === undefined ? undefined : body.reviewWindowEnd ? toDateEnd(body.reviewWindowEnd) : null,
        observerWindowStart:
          body.observerWindowStart === undefined ? undefined : body.observerWindowStart ? toDate(body.observerWindowStart) : null,
        observerWindowEnd:
          body.observerWindowEnd === undefined ? undefined : body.observerWindowEnd ? toDateEnd(body.observerWindowEnd) : null,
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
        { error: '僅「開立中」的週期可刪除；已進入資料準備後不可刪（機關可能已有繳交紀錄）' },
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
