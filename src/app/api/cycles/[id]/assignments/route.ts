import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { requireRole, AuthError } from '@/lib/rbac';
import { writeAuditLog, extractRequestMeta } from '@/lib/audit-log';

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
    if (e instanceof AuthError) return NextResponse.json({ error: e.message }, { status: e.status });
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
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
    if (e instanceof AuthError) return NextResponse.json({ error: e.message }, { status: e.status });
    if (e instanceof z.ZodError) return NextResponse.json({ error: '輸入有誤' }, { status: 400 });
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
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
    if (e instanceof AuthError) return NextResponse.json({ error: e.message }, { status: e.status });
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}
