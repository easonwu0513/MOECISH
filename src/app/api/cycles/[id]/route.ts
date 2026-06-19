import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { requireRole, AuthError } from '@/lib/rbac';
import { writeAuditLog, extractRequestMeta } from '@/lib/audit-log';

const DateStr = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, '日期格式須為 YYYY-MM-DD');

const PatchBody = z.object({
  dueDate: DateStr.optional(),
  prepDueDate: DateStr.nullable().optional(),
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
        dueDate: body.dueDate ? toDate(body.dueDate) : undefined,
        prepDueDate:
          body.prepDueDate === undefined ? undefined : body.prepDueDate ? toDate(body.prepDueDate) : null,
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
    if (e instanceof AuthError) return NextResponse.json({ error: e.message }, { status: e.status });
    if (e instanceof z.ZodError) return NextResponse.json({ error: e.errors[0]?.message ?? '輸入有誤' }, { status: 400 });
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}
