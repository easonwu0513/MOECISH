import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { requireRole } from '@/lib/rbac';
import { errorResponse } from '@/lib/api';
import { writeAuditLog, extractRequestMeta } from '@/lib/audit-log';
import { ensureStandardPrepItems } from '@/lib/prep-standard';

const D = /^\d{4}-\d{2}-\d{2}$/;
const Body = z.object({
  year: z.number().int().min(1900).max(9999),
  checklistVersionId: z.string().min(1),
  organizationIds: z.array(z.string().min(1)).min(1),
  dueDate: z.string().regex(D),
  prepDueDate: z.string().regex(D).nullable().optional(),
  prepDueTech: z.string().regex(D).nullable().optional(),
  onsiteDate: z.string().regex(D).nullable().optional(),
  applyStandardPrep: z.boolean().optional(),
});

/** 批次開立年度週期:多機關一次建立,可同時套用標準資料準備清單。 */
export async function POST(req: Request) {
  try {
    const user = await requireRole('SUPER_ADMIN');
    const body = Body.parse(await req.json());

    const version = await prisma.checklistVersion.findUnique({ where: { id: body.checklistVersionId } });
    if (!version) return NextResponse.json({ error: '題庫版本不存在' }, { status: 400 });

    const created: { organizationId: string; name: string; cycleId: string }[] = [];
    const skipped: string[] = [];

    for (const orgId of body.organizationIds) {
      const org = await prisma.organization.findUnique({ where: { id: orgId } });
      if (!org) { skipped.push(`(不存在的機關 ${orgId})`); continue; }

      const dup = await prisma.auditCycle.findUnique({
        where: { organizationId_year: { organizationId: orgId, year: body.year } },
      });
      if (dup) { skipped.push(org.shortName ?? org.name); continue; }

      const cycle = await prisma.auditCycle.create({
        data: {
          organizationId: orgId,
          year: body.year,
          checklistVersionId: body.checklistVersionId,
          startDate: new Date(),
          dueDate: new Date(`${body.dueDate}T00:00:00+08:00`),
          prepDueDate: body.prepDueDate ? new Date(`${body.prepDueDate}T00:00:00+08:00`) : null,
          prepDueTech: body.prepDueTech ? new Date(`${body.prepDueTech}T00:00:00+08:00`) : null,
          onsiteDate: body.onsiteDate ? new Date(`${body.onsiteDate}T00:00:00+08:00`) : null,
          status: 'DRAFT',
        },
      });

      // 套用標準清單(含三區分類,來源為全域模板;模板空則內建後備)
      if (body.applyStandardPrep) {
        await ensureStandardPrepItems(cycle.id, cycle.year);
      }

      created.push({ organizationId: orgId, name: org.shortName ?? org.name, cycleId: cycle.id });
    }

    const meta = extractRequestMeta(req);
    await writeAuditLog({
      actorId: user.id,
      action: 'CYCLE_BATCH_CREATE',
      entityType: 'AuditCycle',
      entityId: `batch-${body.year}`,
      after: {
        year: body.year,
        created: created.map((c) => c.name),
        skipped,
        applyStandardPrep: !!body.applyStandardPrep,
      },
      ...meta,
    });

    return NextResponse.json({ created, skipped });
  } catch (e) {
    return errorResponse(e);
  }
}
