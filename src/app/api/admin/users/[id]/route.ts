import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { requireRole, AuthError } from '@/lib/rbac';
import { ROLES } from '@/lib/types';
import { writeAuditLog, extractRequestMeta } from '@/lib/audit-log';

const Body = z.object({
  isActive: z.boolean().optional(),
  role: z.enum(ROLES).optional(),
});

/**
 * 使用者管理:停用/啟用、變更角色。
 * 防呆:不可操作自己(避免自鎖);系統必須保留至少一名啟用中的最高管理員;
 * 改成機關管理員時必須已有所屬機關。
 */
export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  try {
    const actor = await requireRole('SUPER_ADMIN');
    const target = await prisma.user.findUnique({ where: { id: params.id } });
    if (!target) return NextResponse.json({ error: '使用者不存在' }, { status: 404 });
    if (target.id === actor.id) {
      return NextResponse.json({ error: '不可變更自己的帳號(避免自鎖),請由其他管理員操作' }, { status: 400 });
    }

    const body = Body.parse(await req.json());

    // 守住最後一位啟用中的最高管理員
    const losingSuperAdmin =
      target.role === 'SUPER_ADMIN' &&
      ((body.isActive === false) || (body.role && body.role !== 'SUPER_ADMIN'));
    if (losingSuperAdmin) {
      const others = await prisma.user.count({
        where: { role: 'SUPER_ADMIN', isActive: true, id: { not: target.id } },
      });
      if (others === 0) {
        return NextResponse.json({ error: '系統至少需保留一名啟用中的最高管理員' }, { status: 400 });
      }
    }

    if (body.role === 'ORG_ADMIN' && !target.organizationId) {
      return NextResponse.json({ error: '此帳號未隸屬任何機關,不可改為機關管理員' }, { status: 400 });
    }

    const updated = await prisma.user.update({
      where: { id: target.id },
      data: { isActive: body.isActive, role: body.role },
    });

    const meta = extractRequestMeta(req);
    await writeAuditLog({
      actorId: actor.id,
      action: 'USER_UPDATE',
      entityType: 'User',
      entityId: target.id,
      before: { isActive: target.isActive, role: target.role },
      after: { isActive: updated.isActive, role: updated.role },
      ...meta,
    });

    return NextResponse.json({ item: { id: updated.id, isActive: updated.isActive, role: updated.role } });
  } catch (e) {
    if (e instanceof AuthError) return NextResponse.json({ error: e.message }, { status: e.status });
    if (e instanceof z.ZodError) return NextResponse.json({ error: e.errors[0]?.message ?? '輸入有誤' }, { status: 400 });
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}
