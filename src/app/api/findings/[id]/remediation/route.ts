import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { requireUser, AuthError } from '@/lib/rbac';
import { writeAuditLog, extractRequestMeta } from '@/lib/audit-log';
import type { RemediationStatus } from '@/lib/types';

const Body = z.object({
  rootCause: z.string().nullable().optional(),
  actions: z.string().nullable().optional(),
  actionTags: z.array(z.string()).optional(),
  plannedDueDate: z.string().nullable().optional(),
  trackingMethod: z.string().nullable().optional(),
  executionStatus: z.string().nullable().optional(),
  submit: z.boolean().optional(),
  version: z.number().int().nonnegative(),
});

export async function PUT(req: Request, { params }: { params: { id: string } }) {
  try {
    const user = await requireUser();
    if (user.role !== 'RESPONDENT' && user.role !== 'SUPERVISOR') {
      return NextResponse.json({ error: '僅填報人或主管可編輯' }, { status: 403 });
    }

    const finding = await prisma.finding.findUnique({
      where: { id: params.id },
      include: { cycle: true, remediation: true },
    });
    if (!finding) return NextResponse.json({ error: '發現不存在' }, { status: 404 });
    if (finding.cycle.organizationId !== user.organizationId) {
      return NextResponse.json({ error: 'forbidden' }, { status: 403 });
    }
    if (finding.type !== 'NEEDS_IMPROVEMENT') {
      return NextResponse.json({ error: '此發現無需改善' }, { status: 400 });
    }

    const body = Body.parse(await req.json());
    const existing = finding.remediation;
    if (!existing) return NextResponse.json({ error: '改善單不存在' }, { status: 404 });
    if (existing.version !== body.version) {
      return NextResponse.json({ error: '資料已被更新，請重新整理' }, { status: 409 });
    }
    const curStatus = existing.status as RemediationStatus;
    if (!['PENDING', 'DRAFT', 'NEEDS_REWORK'].includes(curStatus)) {
      return NextResponse.json({ error: `目前狀態 (${curStatus}) 不可編輯` }, { status: 400 });
    }

    const newStatus: RemediationStatus = body.submit ? 'SUBMITTED' : 'DRAFT';

    const updated = await prisma.remediation.update({
      where: { id: existing.id },
      data: {
        rootCause: body.rootCause ?? null,
        actions: body.actions ?? null,
        actionTagsJson: body.actionTags ? JSON.stringify(body.actionTags) : null,
        plannedDueDate: body.plannedDueDate ? new Date(body.plannedDueDate) : null,
        trackingMethod: body.trackingMethod ?? null,
        executionStatus: body.executionStatus ?? null,
        status: newStatus,
        version: existing.version + 1,
      },
    });

    // Move cycle to REMEDIATION_IN_PROGRESS upon first submission
    if (body.submit && finding.cycle.status === 'FINDINGS_ISSUED') {
      await prisma.auditCycle.update({
        where: { id: finding.cycleId },
        data: {
          status: 'REMEDIATION_IN_PROGRESS',
          stateTransitions: {
            create: {
              fromStatus: 'FINDINGS_ISSUED',
              toStatus: 'REMEDIATION_IN_PROGRESS',
              actorId: user.id,
            },
          },
        },
      });
    }

    const meta = extractRequestMeta(req);
    await writeAuditLog({
      actorId: user.id,
      action: body.submit ? 'REMEDIATION_SUBMIT' : 'REMEDIATION_SAVE',
      entityType: 'Remediation',
      entityId: updated.id,
      before: existing,
      after: updated,
      ...meta,
    });

    return NextResponse.json(updated);
  } catch (e) {
    if (e instanceof AuthError) return NextResponse.json({ error: e.message }, { status: e.status });
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}
