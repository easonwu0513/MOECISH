import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { requireRole } from '@/lib/rbac';
import { errorResponse } from '@/lib/api';
import { writeAuditLog, extractRequestMeta } from '@/lib/audit-log';
import { canAssignAuditors } from '@/lib/stage';
import { ASSIGN_ASPECTS } from '@/lib/audit-score';
import { notifyObserverOnPaired } from '@/lib/notify';
import { appBaseUrl } from '@/lib/baseUrl';
import type { CycleStatus } from '@/lib/types';

/**
 * UAT 圖61:觀察員配對池連動事前場次調查——本週期有對應調查場次(sourceCycleId)時,
 * 只有「該場次意願 OK 或已被最終指派該場次」的觀察員可配對(避免把不能出席者配進來)。
 * 查無對應調查場次(舊資料/未帶入)→ 不限縮,維持全池。回傳 null=不限;Set=允許之 userId。
 */
async function eligibleObserverIdsForCycle(cycleId: string): Promise<Set<string> | null> {
  const session = await prisma.surveySession.findFirst({
    where: { sourceCycleId: cycleId },
    select: { id: true, year: true },
  });
  if (!session) return null;
  const parts = await prisma.surveyParticipant.findMany({
    where: { year: session.year, kind: 'OBSERVER' },
    select: {
      userId: true,
      availabilities: { where: { sessionId: session.id, status: 'OK' }, select: { id: true } },
      finalAssignments: { where: { sessionId: session.id }, select: { id: true } },
    },
  });
  return new Set(
    parts.filter((p) => p.availabilities.length > 0 || p.finalAssignments.length > 0).map((p) => p.userId),
  );
}

/**
 * 觀察員配對(批30 師徒制;SUPER_ADMIN 專用):
 * - GET:本週期配對清單 + 可選觀察員池(現用身分=OBSERVER 或持有效 UserRole 觀察員授權)+ 可選指導池(=本週期已指派委員 ∪ 中心人員)
 * - POST:新增/改指導者(upsert)——mentor 必須是本週期 AuditorAssignment 中的正式委員,或中心人員(初期場次由中心帶審)
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
    // 可選觀察員池=「現用身分為觀察員」∪「多重身分授權(UserRole)持有效觀察員授權」——
    // 只查現用身分會漏掉如「現用機關管理員、已被授予觀察員身分」者(UAT:已授身分卻選不到)
    const cycleOrg = await prisma.auditCycle.findUnique({ where: { id: params.id }, select: { organizationId: true } });
    const orgId = cycleOrg?.organizationId ?? null;
    const observerUsers = await prisma.user.findMany({
      where: {
        isActive: true,
        OR: [
          { role: 'OBSERVER' },
          { roleGrants: { some: { role: 'OBSERVER', endedAt: null } } },
        ],
      },
      select: {
        id: true, name: true, email: true, organizationId: true,
        roleGrants: { where: { endedAt: null, role: 'ORG_ADMIN' }, select: { organizationId: true } },
      },
      orderBy: { name: 'asc' },
    });
    // J UAT:標記「本員為受稽機關的機關管理員」(現用身分或 ORG_ADMIN 授權)→ 前端配對前提示 COI(後端 POST 另硬擋)。roleGrants 不外傳,只回布林。
    // UAT 圖61:連動事前場次調查——有對應調查場次時,池只列「意願 OK 或已被指派該場次」的觀察員
    const eligibleIds = await eligibleObserverIdsForCycle(params.id);
    const observers = observerUsers
      .filter((o) => eligibleIds === null || eligibleIds.has(o.id))
      .map((o) => ({
        id: o.id,
        name: o.name,
        email: o.email,
        coiOrgAdmin: !!orgId && (o.organizationId === orgId || o.roleGrants.some((g) => g.organizationId === orgId)),
      }));
    // 指導池=本週期已指派委員 ∪ 中心人員(UAT:觀察員初期場次由中心人員帶審,第三場起才由委員;
    // 中心恆存在,亦解決開立中尚未指派委員時池空無法配對的問題)。中心人員名稱加註以資區別。
    const mentors = await prisma.auditorAssignment.findMany({
      where: { cycleId: params.id },
      select: { auditor: { select: { id: true, name: true } } },
      orderBy: { createdAt: 'asc' },
    });
    const centerStaff = await prisma.user.findMany({
      where: { role: 'SUPER_ADMIN', isActive: true },
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    });
    const mentorPool = [
      ...mentors.map((m) => m.auditor),
      ...centerStaff
        .filter((u) => !mentors.some((m) => m.auditor.id === u.id))
        .map((u) => ({ id: u.id, name: `${u.name}（中心）` })),
    ];
    return NextResponse.json({ items, observers, mentors: mentorPool });
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
      return NextResponse.json({ error: '實地稽核階段已結束，參與名單已凍結，無法再調整觀察員配對' }, { status: 409 });
    }

    const observer = await prisma.user.findUnique({
      where: { id: body.observerId },
      include: { roleGrants: { where: { endedAt: null } } },
    });
    // 與 GET 池同規則:現用身分為觀察員,或持有效觀察員授權(多重身分者切換至觀察員身分後即可使用)
    const holdsObserverIdentity =
      observer && (observer.role === 'OBSERVER' || observer.roleGrants.some((g) => g.role === 'OBSERVER'));
    if (!observer || !observer.isActive || !holdsObserverIdentity) {
      return NextResponse.json({ error: '觀察員不存在或已停用（帳號須具「觀察員」身分）' }, { status: 400 });
    }
    // UAT 圖61(縱深,與 GET 池同規則):有對應調查場次時,非「意願 OK/已指派該場次」者不可配對
    const eligibleIds = await eligibleObserverIdsForCycle(params.id);
    if (eligibleIds !== null && !eligibleIds.has(body.observerId)) {
      return NextResponse.json(
        { error: '該觀察員於事前場次調查未對本場次表達可出席（或未被指派該場次），不可配對。' },
        { status: 400 },
      );
    }
    // 迴避原則(比照委員):觀察員不得觀摩自己服務之機關——含現用身分之機關,
    // 以及多重身分授權(UserRole)中持有該機關「機關管理員」授權者(利益迴避查授權全集,非只現用身分)。
    const holdsOrgAdminOfCycleOrg = observer.roleGrants.some(
      (g) => g.role === 'ORG_ADMIN' && g.organizationId === cycle.organizationId,
    );
    if ((observer.organizationId && observer.organizationId === cycle.organizationId) || holdsOrgAdminOfCycleOrg) {
      return NextResponse.json({ error: '觀察員不得觀摩自己服務之機關（迴避原則，含其多重身分所屬機關）' }, { status: 400 });
    }

    // 指導者=本週期已指派的正式委員,或中心人員(觀察員初期場次由中心帶審)
    const mentorAssigned = await prisma.auditorAssignment.findUnique({
      where: { cycleId_auditorId: { cycleId: params.id, auditorId: body.mentorId } },
      select: { auditorId: true },
    });
    if (!mentorAssigned) {
      const centerMentor = await prisma.user.findUnique({
        where: { id: body.mentorId },
        select: { role: true, isActive: true },
      });
      if (!centerMentor || centerMentor.role !== 'SUPER_ADMIN' || !centerMentor.isActive) {
        return NextResponse.json({ error: '指導者必須是本週期已指派的稽核委員或中心人員' }, { status: 400 });
      }
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
      return NextResponse.json({ error: '該員已是本週期指派委員，不可同時列為觀察員' }, { status: 400 });
    }
    // 對稱防呆(專審 P2,指導池納中心人員後的新邊角):mentor 與 observer 兩集合必不相交——
    // 放寬前 mentor 必為指派委員、observerAlsoAuditor 已保證不相交;放寬後中心人員 fallback 繞過該對稱,
    // 持觀察員授權的中心帳號可能同週期「既是練習者又是評回饋者」,此處雙向補閘。
    const mentorIsObserver = await prisma.cycleObserver.findUnique({
      where: { cycleId_observerId: { cycleId: params.id, observerId: body.mentorId } },
      select: { id: true },
    });
    if (mentorIsObserver) {
      return NextResponse.json({ error: '該員已是本週期配對觀察員，不可同時擔任指導者' }, { status: 400 });
    }
    const observerIsMentor = await prisma.cycleObserver.count({
      where: { cycleId: params.id, mentorId: body.observerId },
    });
    if (observerIsMentor > 0) {
      return NextResponse.json({ error: '該員已是本週期其他觀察員的指導者，不可再配對為觀察員' }, { status: 400 });
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

    // 通知該觀察員已受配對(email + 站內);寄信失敗不影響配對(非阻擋)。
    notifyObserverOnPaired({
      cycleId: params.id,
      observerId: body.observerId,
      mentorId: body.mentorId,
      appBaseUrl: appBaseUrl(req),
    }).catch((e) => console.error('[observers] 通知觀察員配對失敗：', (e as Error).message));

    return NextResponse.json({ item });
  } catch (e) {
    return errorResponse(e);
  }
}

const PatchBody = z.object({
  observerId: z.string().min(1),
  dimensions: z.array(z.enum(ASSIGN_ASPECTS)), // 觀察員負責構面(比照委員;空陣列=清空,視同全構面)
});

/**
 * 設定觀察員負責構面(UAT 批43:比照委員指派的構面勾選)。
 * 純練習聚焦標籤(練習工作台標示負責構面),不影響授權;凍結閘與配對增刪同(canAssignAuditors)。
 */
export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  try {
    const user = await requireRole('SUPER_ADMIN');
    const body = PatchBody.parse(await req.json());

    const cycle = await prisma.auditCycle.findUnique({
      where: { id: params.id },
      select: { status: true },
    });
    if (!cycle) return NextResponse.json({ error: '稽核週期不存在' }, { status: 404 });
    if (!canAssignAuditors(cycle.status as CycleStatus)) {
      return NextResponse.json({ error: '實地稽核階段已結束，參與名單已凍結，無法再調整觀察員構面' }, { status: 409 });
    }

    const uniq = Array.from(new Set(body.dimensions));
    const updated = await prisma.cycleObserver.updateMany({
      where: { cycleId: params.id, observerId: body.observerId },
      data: { dimensions: uniq.length ? JSON.stringify(uniq) : null },
    });
    if (updated.count === 0) {
      return NextResponse.json({ error: '該觀察員未配對於本週期' }, { status: 404 });
    }

    await writeAuditLog({
      actorId: user.id,
      action: 'OBSERVER_SET_DIMENSIONS',
      entityType: 'AuditCycle',
      entityId: params.id,
      after: { observerId: body.observerId, dimensions: uniq },
      ...extractRequestMeta(req),
    });

    return NextResponse.json({ ok: true });
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
      return NextResponse.json({ error: '實地稽核階段已結束，參與名單已凍結，無法再移除觀察員配對' }, { status: 409 });
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
      after: { observerId, note: '練習紀錄留存（中心仍可檢視）；觀察員即失去此週期存取' },
      ...extractRequestMeta(req),
    });

    return NextResponse.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
