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

    const auditor = await prisma.user.findUnique({
      where: { id: body.auditorId },
      include: { roleGrants: { where: { endedAt: null } } },
    });
    if (!auditor || auditor.role !== 'AUDITOR' || !auditor.isActive) {
      return NextResponse.json({ error: '稽核委員不存在或已停用' }, { status: 400 });
    }
    // 委員迴避:不得審查自己服務機關——含多重身分授權(批31):持有該機關「機關管理員」授權者
    // 亦不得被指派(利益迴避查授權全集,非只現用身分)。
    const holdsOrgAdminOfCycleOrg = auditor.roleGrants.some(
      (g) => g.role === 'ORG_ADMIN' && g.organizationId === cycle.organizationId,
    );
    if ((auditor.organizationId && auditor.organizationId === cycle.organizationId) || holdsOrgAdminOfCycleOrg) {
      return NextResponse.json({ error: '委員不得審查自己服務之機關（迴避原則,含其多重身分所屬機關）' }, { status: 400 });
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

    // 名單凍結同樣涵蓋「構面/召集委員」設定:彙整報告的領隊與各構面委員由 assignment 即時導出,
    // 缺失發布後再改會改寫已發布報告的歷史歸屬(與新增/移除同一凍結閘)。
    const cycle = await prisma.auditCycle.findUnique({ where: { id: params.id }, select: { status: true } });
    if (!cycle) return NextResponse.json({ error: '稽核週期不存在' }, { status: 404 });
    if (!canAssignAuditors(cycle.status as CycleStatus)) {
      return NextResponse.json(
        { error: '實地稽核階段已結束,委員名單已凍結,無法再調整負責構面或召集委員' },
        { status: 409 },
      );
    }

    const exists = await prisma.auditorAssignment.findUnique({
      where: { cycleId_auditorId: { cycleId: params.id, auditorId: body.auditorId } },
    });
    if (!exists) return NextResponse.json({ error: '該委員未指派此週期' }, { status: 404 });
    // 定稿保護:委員已「確認填寫完畢」後,其構面歸屬即為報告內容的一部分,不可再改;須先退件解除定稿
    if (exists.scoreLockedAt) {
      return NextResponse.json(
        { error: '該委員已確認填寫完畢(定稿),不可再調整其負責構面/角色。如確需調整,請先於「彙整報告」頁對其「退件」解除定稿' },
        { status: 409 },
      );
    }

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

    const cycle = await prisma.auditCycle.findUnique({
      where: { id: params.id },
      select: { status: true },
    });
    if (!cycle) return NextResponse.json({ error: '稽核週期不存在' }, { status: 404 });
    // 名單凍結雙向適用:實地稽核結束後(缺失發布中起)不得新增「也不得移除」指派,
    // 否則稽核紀錄(誰參與本次稽核)可被事後改寫(對齊 POST 新增閘)。
    if (!canAssignAuditors(cycle.status as CycleStatus)) {
      // 補救文案須指向狀態機真實存在的路徑:REPORT_ISSUED 唯一回退目標是「開立中」(無回退至實地稽核的邊)
      return NextResponse.json(
        { error: '實地稽核階段已結束,委員名單已凍結,無法再移除指派。如確需調整,請將週期回退至「開立中」後處理(重大操作,請審慎)' },
        { status: 409 },
      );
    }

    const assignment = await prisma.auditorAssignment.findUnique({
      where: { cycleId_auditorId: { cycleId: params.id, auditorId } },
      select: { scoreLockedAt: true },
    });
    if (!assignment) return NextResponse.json({ error: '該委員未被指派於本週期' }, { status: 404 });
    // 師徒制(批30):該委員若為本週期觀察員的指導委員,移除會使配對懸空(觀察員練習無人指導)——
    // 須先於「觀察員配對」改指派其他指導委員後再移除。
    const menteeCount = await prisma.cycleObserver.count({ where: { cycleId: params.id, mentorId: auditorId } });
    if (menteeCount > 0) {
      return NextResponse.json(
        { error: `該委員目前為本週期 ${menteeCount} 位觀察員的指導委員,請先於「觀察員配對」改指派其他指導委員後再移除` },
        { status: 409 },
      );
    }
    // 定稿保護:已「確認填寫完畢」(定稿)的委員不可直接移除——移除會刪掉其定稿紀錄、
    // 並讓「全委員定稿才能完成年度稽核」的閘門失真;須先於彙整報告頁「退件」解除定稿。
    if (assignment.scoreLockedAt) {
      return NextResponse.json(
        { error: '該委員已確認填寫完畢(定稿),不可直接移除。如確需移除,請先於「彙整報告」頁對其「退件」解除定稿後再移除' },
        { status: 409 },
      );
    }

    // 條件式刪除消除 check-then-delete race:委員在檢查與刪除之間按下「確認填寫完畢」時,
    // 這裡會刪到 0 筆 → 回 409(與上面的定稿保護同語意),不會刪掉剛定稿的指派
    const deleted = await prisma.auditorAssignment.deleteMany({
      where: { cycleId: params.id, auditorId, scoreLockedAt: null },
    });
    if (deleted.count === 0) {
      return NextResponse.json(
        { error: '該委員剛完成定稿,未移除。如確需移除,請先於「彙整報告」頁對其「退件」解除定稿' },
        { status: 409 },
      );
    }

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
