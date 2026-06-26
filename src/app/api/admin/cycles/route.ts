import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { requireRole } from '@/lib/rbac';
import { errorResponse } from '@/lib/api';
import { writeAuditLog, extractRequestMeta } from '@/lib/audit-log';

const Body = z.object({
  organizationId: z.string().min(1),
  year: z.number().int().min(1900).max(9999),
  checklistVersionId: z.string().min(1),
  dueDate: z.string().optional(), // 矯正填報截止:可不填,實地稽核/發文後再設
  startDate: z.string().optional(),
});

export async function POST(req: Request) {
  try {
    const user = await requireRole('SUPER_ADMIN');
    const body = Body.parse(await req.json());

    // enforce @@unique([organizationId, year])
    const dup = await prisma.auditCycle.findUnique({
      where: { organizationId_year: { organizationId: body.organizationId, year: body.year } },
    });
    if (dup) {
      return NextResponse.json(
        { error: `該機關 ${body.year} 年度週期已存在` },
        { status: 400 },
      );
    }

    const cycle = await prisma.auditCycle.create({
      data: {
        organizationId: body.organizationId,
        year: body.year,
        checklistVersionId: body.checklistVersionId,
        startDate: body.startDate ? new Date(body.startDate) : new Date(),
        dueDate: body.dueDate ? new Date(body.dueDate) : null,
        status: 'DRAFT',
      },
    });

    const meta = extractRequestMeta(req);
    await writeAuditLog({
      actorId: user.id,
      action: 'CYCLE_CREATE',
      entityType: 'AuditCycle',
      entityId: cycle.id,
      after: cycle,
      ...meta,
    });

    // 通知機關已移至週期頁「通知機關」按鈕(中心設定好日期、確認時程後再正式通知)。
    return NextResponse.json(cycle);
  } catch (e) {
    return errorResponse(e);
  }
}
