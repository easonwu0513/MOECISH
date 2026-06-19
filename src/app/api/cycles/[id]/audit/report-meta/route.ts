import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { assertCycleAccess } from '@/lib/rbac';
import { errorResponse } from '@/lib/api';
import { writeAuditLog, extractRequestMeta } from '@/lib/audit-log';

const Body = z.object({
  auditDateRaw: z.string().optional(),
  scope: z.string().optional(),
  auditCriteria: z.array(z.string()).optional(),
  lead: z.object({ name: z.string(), title: z.string() }).optional(),
  subLead: z.object({ name: z.string(), title: z.string(), org: z.string() }).optional(),
  team: z.object({
    strategy: z.array(z.string()),
    management: z.array(z.string()),
    technical: z.array(z.string()),
  }).optional(),
});

/** 最高管理員設定彙整報告頁首(稽核日期/範圍/準則/稽核小組)。 */
export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  try {
    const { user, cycle } = await assertCycleAccess(params.id);
    if (user.role !== 'SUPER_ADMIN') {
      return NextResponse.json({ error: '僅最高管理員可設定報告資訊' }, { status: 403 });
    }
    const body = Body.parse(await req.json());

    const prev = cycle.auditReportMeta ? JSON.parse(cycle.auditReportMeta) : {};
    const merged = { ...prev, ...body };
    await prisma.auditCycle.update({
      where: { id: cycle.id },
      data: { auditReportMeta: JSON.stringify(merged) },
    });

    await writeAuditLog({
      actorId: user.id,
      action: 'audit.report-meta.update',
      entityType: 'AuditCycle',
      entityId: cycle.id,
      after: merged,
      ...extractRequestMeta(req),
    });

    return NextResponse.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
