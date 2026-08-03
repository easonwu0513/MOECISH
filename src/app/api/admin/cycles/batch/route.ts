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
  // UAT 圖10:每機關可各自附實地稽核日期;organizations 優先,organizationIds 保留向後相容
  organizations: z
    .array(z.object({ organizationId: z.string().min(1), onsiteDate: z.string().regex(D).nullable().optional() }))
    .min(1)
    .optional(),
  organizationIds: z.array(z.string().min(1)).min(1).optional(),
  dueDate: z.string().regex(D).nullable().optional(),
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

    // 統一為 [{ organizationId, onsiteDate }] 形狀:organizations 優先(UAT 圖10 每機關日期),
    // organizationIds 走統一 onsiteDate(向後相容);兩者皆缺=400。
    const entries =
      body.organizations ??
      body.organizationIds?.map((id) => ({ organizationId: id, onsiteDate: body.onsiteDate ?? null }));
    if (!entries || entries.length === 0) {
      return NextResponse.json({ error: '請至少選擇一個機關' }, { status: 400 });
    }

    const created: { organizationId: string; name: string; cycleId: string }[] = [];
    const skipped: string[] = [];

    for (const entry of entries) {
      const orgId = entry.organizationId;
      const org = await prisma.organization.findUnique({ where: { id: orgId } });
      if (!org) { skipped.push(`（不存在的機關 ${orgId})`); continue; }

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
          dueDate: body.dueDate ? new Date(`${body.dueDate}T00:00:00+08:00`) : null,
          prepDueDate: body.prepDueDate ? new Date(`${body.prepDueDate}T00:00:00+08:00`) : null,
          prepDueTech: body.prepDueTech ? new Date(`${body.prepDueTech}T00:00:00+08:00`) : null,
          onsiteDate: entry.onsiteDate ? new Date(`${entry.onsiteDate}T00:00:00+08:00`) : null,
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
