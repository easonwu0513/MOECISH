import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { requireRole } from '@/lib/rbac';
import { errorResponse } from '@/lib/api';
import { writeAuditLog, extractRequestMeta } from '@/lib/audit-log';
import { canAssignAuditors } from '@/lib/stage';
import type { CycleStatus } from '@/lib/types';

/**
 * 觀察員配對(批30 師徒制;SUPER_ADMIN 專用):
 * - GET:本週期配對清單 + 可選觀察員池(role=OBSERVER)+ 可選指導委員池(=本週期已指派委員)
 * - POST:新增/改指導委員(upsert)——mentor 必須是本週期 AuditorAssignment 中的正式委員
 * - DELETE:移除配對(練習紀錄留存,由中心仍可檢視;觀察員即失去此週期存取)
 * 名單凍結與委員指派同閘(canAssignAuditors):實地稽核結束後不得增刪改(參與紀錄不可事後改寫)。
 */
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  try {
    await requireRole('SUPER_ADMIN');
    const items = await prisma.cycleObserver.findMany({
      where: { cycleId: params.id },
      include: {
        observer: { select: { id: true, name: true, email: true } },
        mentor: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: 'asc' },
    });
    const observers = await prisma.user.findMany({
      where: { role: 'OBSERVER', isActive: true },
      select: { id: true, name: true, email: true },
      orderBy: { name: 'asc' },
    });
    const mentors = await prisma.auditorAssignment.findMany({
      where: { cycleId: params.id },
      select: { auditor: { select: { id: true, name: true } } },
      orderBy: { createdAt: 'asc' },
    });
    return NextResponse.json({ items, observers, mentors: mentors.map((m) => m.auditor) });
  } catch (e) {
    return errorResponse(e);
  }
}

const Body = z.object({ observerId: z.string().min(1), mentorId: z.string().min(1) });

export async function POST(req: Request, { params }: { params: { id: string } }) {
  try {
    const user = await requireRole('SUPER_ADMIN');
    const body = Body.parse(await req.json());

    const cycle = await prisma.auditCycle.findUnique({
      where: { id: params.id },
      select: { id: true, status: true, organizationId: true },
    });
    if (!cycle) return NextResponse.json({ error: '稽核週期不存在' }, { status: 404 });
    if (!canAssignAuditors(cycle.status as CycleStatus)) {
      return NextResponse.json({ error: '實地稽核階段已結束,參與名單已凍結,無法再調整觀察員配對' }, { status: 409 });
    }

    const observer = await prisma.user.findUnique({
      where: { id: body.observerId },
      include: { roleGrants: { where: { endedAt: null } } },
    });
    if (!observer || observer.role !== 'OBSERVER' || !observer.isActive) {
      return NextResponse.json({ error: '觀察員不存在或已停用(帳號現用身分須為「觀察員」)' }, { status: 400 });
    }
    // 迴避原則(比照委員):觀察員不得觀摩自己服務之機關——含現用身分之機關,
    // 以及多重身分授權(UserRole)中持有該機關「機關管理員」授權者(利益迴避查授權全集,非只現用身分)。
    const holdsOrgAdminOfCycleOrg = observer.roleGrants.some(
      (g) => g.role === 'ORG_ADMIN' && g.organizationId === cycle.organizationId,
    );
    if ((observer.organizationId && observer.organizationId === cycle.organizationId) || holdsOrgAdminOfCycleOrg) {
      return NextResponse.json({ error: '觀察員不得觀摩自己服務之機關(迴避原則,含其多重身分所屬機關)' }, { status: 400 });
    }

    // 指導委員必須是本週期已指派的正式委員(師徒制的「當場次」約束)
    const mentorAssigned = await prisma.auditorAssignment.findUnique({
      where: { cycleId_auditorId: { cycleId: params.id, auditorId: body.mentorId } },
      select: { auditorId: true },
    });
    if (!mentorAssigned) {
      return NextResponse.json({ error: '指導委員必須是本週期已指派的稽核委員' }, { status: 400 });
    }
    // 防呆(批30 對抗審查 P2):不可自己指導自己;觀察員不可同時是本週期的正式委員(多重身分邊角)
    if (body.observerId === body.mentorId) {
      return NextResponse.json({ error: '指導委員不可為觀察員本人' }, { status: 400 });
    }
    const observerAlsoAuditor = await prisma.auditorAssignment.findUnique({
      where: { cycleId_auditorId: { cycleId: params.id, auditorId: body.observerId } },
      select: { auditorId: true },
    });
    if (observerAlsoAuditor) {
      return NextResponse.json({ error: '該員已是本週期指派委員,不可同時列為觀察員' }, { status: 400 });
    }

    const item = await prisma.cycleObserver.upsert({
      where: { cycleId_observerId: { cycleId: params.id, observerId: body.observerId } },
      create: { cycleId: params.id, observerId: body.observerId, mentorId: body.mentorId },
      update: { mentorId: body.mentorId },
      include: {
        observer: { select: { id: true, name: true, email: true } },
        mentor: { select: { id: true, name: true } },
      },
    });

    await writeAuditLog({
      actorId: user.id,
      action: 'OBSERVER_ASSIGN',
      entityType: 'AuditCycle',
      entityId: params.id,
      after: { observerId: body.observerId, mentorId: body.mentorId },
      ...extractRequestMeta(req),
    });

    return NextResponse.json({ item });
  } catch (e) {
    return errorResponse(e);
  }
}

export async function DELETE(req: Request, { params }: { params: { id: string } }) {
  try {
    const user = await requireRole('SUPER_ADMIN');
    const url = new URL(req.url);
    const observerId = url.searchParams.get('observerId') ?? '';
    if (!observerId) return NextResponse.json({ error: 'observerId required' }, { status: 400 });

    const cycle = await prisma.auditCycle.findUnique({
      where: { id: params.id },
      select: { status: true },
    });
    if (!cycle) return NextResponse.json({ error: '稽核週期不存在' }, { status: 404 });
    if (!canAssignAuditors(cycle.status as CycleStatus)) {
      return NextResponse.json({ error: '實地稽核階段已結束,參與名單已凍結,無法再移除觀察員配對' }, { status: 409 });
    }

    const deleted = await prisma.cycleObserver.deleteMany({
      where: { cycleId: params.id, observerId },
    });
    if (deleted.count === 0) {
      return NextResponse.json({ error: '該觀察員未配對於本週期' }, { status: 404 });
    }

    await writeAuditLog({
      actorId: user.id,
      action: 'OBSERVER_UNASSIGN',
      entityType: 'AuditCycle',
      entityId: params.id,
      after: { observerId, note: '練習紀錄留存(中心仍可檢視);觀察員即失去此週期存取' },
      ...extractRequestMeta(req),
    });

    return NextResponse.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
