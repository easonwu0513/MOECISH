import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { requireRole } from '@/lib/rbac';
import { errorResponse } from '@/lib/api';
import { listIdentities } from '@/lib/identity';
import { writeAuditLog, extractRequestMeta } from '@/lib/audit-log';

/**
 * 身分授權管理(批31/方案A;SUPER_ADMIN 專用):
 * - GET:此帳號可用身分(含隱含身分)+ 歷史授權
 * - POST:新增授權(僅 ORG_ADMIN/AUDITOR/OBSERVER——新 API 不開 SUPER_ADMIN 授予面,
 *   最高管理員仍走既有帳號編輯直改 role,縮小提權面)
 * - DELETE:收回授權(endedAt 蓋章留歷史);若收回的正是現用身分,自動切換至另一有效身分,
 *   無其他身分則拒絕(帳號不可無身分;請改用停用帳號)。
 */
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  try {
    await requireRole('SUPER_ADMIN');
    const identities = await listIdentities(params.id);
    const history = await prisma.userRole.findMany({
      where: { userId: params.id, endedAt: { not: null } },
      orderBy: { endedAt: 'desc' },
      take: 20,
    });
    return NextResponse.json({ identities, history });
  } catch (e) {
    return errorResponse(e);
  }
}

const GrantBody = z.object({
  role: z.enum(['ORG_ADMIN', 'AUDITOR', 'OBSERVER']),
  organizationId: z.string().optional(),
});

export async function POST(req: Request, { params }: { params: { id: string } }) {
  try {
    const admin = await requireRole('SUPER_ADMIN');
    const body = GrantBody.parse(await req.json());

    const target = await prisma.user.findUnique({ where: { id: params.id }, select: { id: true, isActive: true, role: true, organizationId: true } });
    if (!target || !target.isActive) return NextResponse.json({ error: '帳號不存在或已停用' }, { status: 404 });

    if (body.role === 'ORG_ADMIN') {
      if (!body.organizationId) return NextResponse.json({ error: '機關管理員授權須指定機關' }, { status: 400 });
      const org = await prisma.organization.findUnique({ where: { id: body.organizationId }, select: { id: true } });
      if (!org) return NextResponse.json({ error: '機關不存在' }, { status: 400 });
    }
    const orgId = body.role === 'ORG_ADMIN' ? body.organizationId! : body.organizationId ?? null;

    // 去重:同 (role, organizationId) 已有有效授權或即為現用身分 → 不重複建
    const identities = await listIdentities(params.id);
    if (identities.some((i) => i.role === body.role && i.organizationId === (orgId ?? null))) {
      return NextResponse.json({ error: '此身分已存在(有效授權或現用身分)' }, { status: 409 });
    }

    // 首次授予時把「現用身分」補進授權表:讓切換選單完整呈現(隱含→顯式),歷史也可追。
    const hasGrants = await prisma.userRole.count({ where: { userId: params.id, endedAt: null } });
    if (hasGrants === 0) {
      await prisma.userRole.create({
        data: {
          userId: params.id,
          role: target.role,
          organizationId: target.organizationId,
          createdById: admin.id,
        },
      });
    }

    const created = await prisma.userRole.create({
      data: { userId: params.id, role: body.role, organizationId: orgId, createdById: admin.id },
    });

    await writeAuditLog({
      actorId: admin.id,
      action: 'ROLE_GRANT_CREATE',
      entityType: 'UserRole',
      entityId: created.id,
      after: { userId: params.id, role: body.role, organizationId: orgId },
      ...extractRequestMeta(req),
    });

    return NextResponse.json({ item: created });
  } catch (e) {
    return errorResponse(e);
  }
}

export async function DELETE(req: Request, { params }: { params: { id: string } }) {
  try {
    const admin = await requireRole('SUPER_ADMIN');
    const url = new URL(req.url);
    const grantId = url.searchParams.get('grantId') ?? '';
    if (!grantId) return NextResponse.json({ error: 'grantId required' }, { status: 400 });

    const grant = await prisma.userRole.findUnique({ where: { id: grantId } });
    if (!grant || grant.userId !== params.id || grant.endedAt) {
      return NextResponse.json({ error: '授權不存在或已收回' }, { status: 404 });
    }

    const target = await prisma.user.findUnique({
      where: { id: params.id },
      select: { role: true, organizationId: true },
    });
    if (!target) return NextResponse.json({ error: '帳號不存在' }, { status: 404 });

    const isCurrent =
      grant.role === target.role && (grant.organizationId ?? null) === (target.organizationId ?? null);

    if (isCurrent) {
      // 收回現用身分 → 自動切至另一有效授權;沒有其他授權則拒絕(帳號不可處於無身分狀態)
      const others = await prisma.userRole.findMany({
        where: { userId: params.id, endedAt: null, id: { not: grant.id } },
        orderBy: { createdAt: 'asc' },
      });
      if (others.length === 0) {
        return NextResponse.json(
          { error: '這是該帳號唯一的身分,不可收回;如需停止使用請改「停用帳號」' },
          { status: 409 },
        );
      }
      const next = others[0];
      await prisma.$transaction([
        prisma.userRole.update({ where: { id: grant.id }, data: { endedAt: new Date() } }),
        prisma.user.update({
          where: { id: params.id },
          data: { role: next.role, organizationId: next.organizationId },
        }),
      ]);
    } else {
      await prisma.userRole.update({ where: { id: grant.id }, data: { endedAt: new Date() } });
    }

    await writeAuditLog({
      actorId: admin.id,
      action: 'ROLE_GRANT_END',
      entityType: 'UserRole',
      entityId: grant.id,
      before: { userId: params.id, role: grant.role, organizationId: grant.organizationId, wasCurrent: isCurrent },
      ...extractRequestMeta(req),
    });

    return NextResponse.json({
      ok: true,
      // 批36:收回的是現用身分時已自動切換——回傳新現用身分讓前端提示副作用(中心才知道對方換了身分)
      ...(isCurrent ? { switchedTo: (await prisma.user.findUnique({ where: { id: params.id }, select: { role: true } }))?.role ?? null } : {}),
    });
  } catch (e) {
    return errorResponse(e);
  }
}
