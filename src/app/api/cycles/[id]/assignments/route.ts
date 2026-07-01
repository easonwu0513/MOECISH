import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { requireRole } from '@/lib/rbac';
import { errorResponse } from '@/lib/api';
import { writeAuditLog, extractRequestMeta } from '@/lib/audit-log';
import { ASSIGN_ASPECTS } from '@/lib/audit-score';
import { canAssignAuditors } from '@/lib/stage';
import type { CycleStatus } from '@/lib/types';

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  try {
    await requireRole('SUPER_ADMIN');
    const items = await prisma.auditorAssignment.findMany({
      where: { cycleId: params.id },
      include: { auditor: { select: { id: true, name: true, email: true } } },
      orderBy: { createdAt: 'asc' },
    });
    const auditors = await prisma.user.findMany({
      where: { role: 'AUDITOR', isActive: true },
      select: { id: true, name: true, email: true },
      orderBy: { name: 'asc' },
    });
    return NextResponse.json({ items, auditors });
  } catch (e) {
    return errorResponse(e);
  }
}

const Body = z.object({ auditorId: z.string().min(1) });

export async function POST(req: Request, { params }: { params: { id: string } }) {
  try {
    const user = await requireRole('SUPER_ADMIN');
    const body = Body.parse(await req.json());

    const cycle = await prisma.auditCycle.findUnique({
      where: { id: params.id },
      include: { organization: true },
    });
    if (!cycle) return NextResponse.json({ error: '稽核週期不存在' }, { status: 404 });
    // 實地稽核結束後(缺失發布中起)凍結委員名單:不得再新增指派(與 client 共用 canAssignAuditors)
    if (!canAssignAuditors(cycle.status as CycleStatus)) {
      return NextResponse.json({ error: '實地稽核階段已結束,委員名單已凍結,無法再新增指派' }, { status: 409 });
    }

    const auditor = await prisma.user.findUnique({ where: { id: body.auditorId } });
    if (!auditor || auditor.role !== 'AUDITOR' || !auditor.isActive) {
      return NextResponse.json({ error: '稽核委員不存在或已停用' }, { status: 400 });
    }
    // 委員迴避:不得審查自己服務機關
    if (auditor.organizationId && auditor.organizationId === cycle.organizationId) {
      return NextResponse.json({ error: '委員不得審查自己服務之機關（迴避原則）' }, { status: 400 });
    }

    const item = await prisma.auditorAssignment.upsert({
      where: { cycleId_auditorId: { cycleId: params.id, auditorId: body.auditorId } },
      create: { cycleId: params.id, auditorId: body.auditorId },
      update: {},
      include: { auditor: { select: { id: true, name: true, email: true } } },
    });

    const meta = extractRequestMeta(req);
    await writeAuditLog({
      actorId: user.id,
      action: 'AUDITOR_ASSIGN',
      entityType: 'AuditCycle',
      entityId: params.id,
      after: { auditorId: body.auditorId },
      ...meta,
    });

    return NextResponse.json({ item });
  } catch (e) {
    return errorResponse(e);
  }
}

const PatchBody = z.object({
  auditorId: z.string().min(1),
  role: z.enum(['LEAD', 'MEMBER']).optional(),
  dimensions: z.array(z.enum(ASSIGN_ASPECTS)).optional(), // 指派負責構面(三構面四類)
});

/**
 * 更新指派:設定召集委員(LEAD,一週期僅一位)或指派負責稽核構面(dimensions)。
 * 兩者擇一傳入即可。
 */
export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  try {
    const user = await requireRole('SUPER_ADMIN');
    const body = PatchBody.parse(await req.json());
    const exists = await prisma.auditorAssignment.findUnique({
      where: { cycleId_auditorId: { cycleId: params.id, auditorId: body.auditorId } },
    });
    if (!exists) return NextResponse.json({ error: '該委員未指派此週期' }, { status: 404 });

    // 指派負責構面(去重後存 JSON;空陣列 = 清空,視同全構面)
    if (body.dimensions !== undefined) {
      const uniq = Array.from(new Set(body.dimensions));
      await prisma.auditorAssignment.update({
        where: { cycleId_auditorId: { cycleId: params.id, auditorId: body.auditorId } },
        data: { dimensions: uniq.length ? JSON.stringify(uniq) : null },
      });
      await writeAuditLog({
        actorId: user.id,
        action: 'AUDITOR_SET_DIMENSIONS',
        entityType: 'AuditCycle',
        entityId: params.id,
        after: { auditorId: body.auditorId, dimensions: uniq },
        ...extractRequestMeta(req),
      });
      return NextResponse.json({ ok: true });
    }

    if (body.role !== undefined) {
      await prisma.$transaction(async (tx) => {
        if (body.role === 'LEAD') {
          await tx.auditorAssignment.updateMany({ where: { cycleId: params.id }, data: { role: 'MEMBER' } });
          await tx.auditorAssignment.update({
            where: { cycleId_auditorId: { cycleId: params.id, auditorId: body.auditorId } },
            data: { role: 'LEAD' },
          });
        } else {
          await tx.auditorAssignment.update({
            where: { cycleId_auditorId: { cycleId: params.id, auditorId: body.auditorId } },
            data: { role: 'MEMBER' },
          });
        }
      });
      await writeAuditLog({
        actorId: user.id,
        action: 'AUDITOR_SET_ROLE',
        entityType: 'AuditCycle',
        entityId: params.id,
        after: { auditorId: body.auditorId, role: body.role },
        ...extractRequestMeta(req),
      });
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ error: '未提供要更新的欄位' }, { status: 400 });
  } catch (e) {
    return errorResponse(e);
  }
}

export async function DELETE(req: Request, { params }: { params: { id: string } }) {
  try {
    const user = await requireRole('SUPER_ADMIN');
    const url = new URL(req.url);
    const auditorId = url.searchParams.get('auditorId') ?? '';
    if (!auditorId) return NextResponse.json({ error: 'auditorId required' }, { status: 400 });

    await prisma.auditorAssignment.deleteMany({
      where: { cycleId: params.id, auditorId },
    });

    const meta = extractRequestMeta(req);
    await writeAuditLog({
      actorId: user.id,
      action: 'AUDITOR_UNASSIGN',
      entityType: 'AuditCycle',
      entityId: params.id,
      after: { auditorId },
      ...meta,
    });

    return NextResponse.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
