import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { requireRole, AuthError } from '@/lib/rbac';
import { writeAuditLog, extractRequestMeta } from '@/lib/audit-log';
import { notifyCycleRespondents } from '@/lib/notify';
import { appBaseUrl } from '@/lib/baseUrl';

const Body = z.object({
  organizationId: z.string().min(1),
  year: z.number().int().min(1900).max(9999),
  checklistVersionId: z.string().min(1),
  dueDate: z.string().min(1),
  startDate: z.string().optional(),
  notify: z.boolean().optional(),
});

export async function POST(req: Request) {
  try {
    const user = await requireRole('ADMIN');
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
        dueDate: new Date(body.dueDate),
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

    if (body.notify) {
      await notifyCycleRespondents({
        cycleId: cycle.id,
        triggeredById: user.id,
        appBaseUrl: appBaseUrl(req),
      });
    }

    return NextResponse.json(cycle);
  } catch (e) {
    if (e instanceof AuthError) return NextResponse.json({ error: e.message }, { status: e.status });
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}
