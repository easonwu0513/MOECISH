import { NextResponse } from 'next/server';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import { prisma } from '@/lib/db';
import { inviteStatus } from '@/lib/invite';
import { writeAuditLog, extractRequestMeta } from '@/lib/audit-log';

const Body = z.object({
  password: z.string().min(8).max(128),
});

export async function POST(req: Request, { params }: { params: { token: string } }) {
  try {
    const body = Body.parse(await req.json());

    const inv = await prisma.invitation.findUnique({ where: { token: params.token } });
    if (!inv) return NextResponse.json({ error: '邀請不存在' }, { status: 404 });

    const status = inviteStatus(inv);
    if (status !== 'pending') {
      return NextResponse.json(
        { error: status === 'used' ? '邀請已被使用' : status === 'expired' ? '邀請已過期' : '邀請已失效' },
        { status: 400 },
      );
    }

    const passwordHash = await bcrypt.hash(body.password, 10);

    // 若該 email 已有使用者（之前 admin 手動建過），更新；否則新建
    let user = await prisma.user.findUnique({ where: { email: inv.email } });
    if (user) {
      user = await prisma.user.update({
        where: { id: user.id },
        data: {
          passwordHash,
          isActive: true,
          name: inv.name,
          role: inv.role,
          organizationId: inv.organizationId,
        },
      });
    } else {
      user = await prisma.user.create({
        data: {
          email: inv.email,
          name: inv.name,
          role: inv.role,
          organizationId: inv.organizationId,
          passwordHash,
          isActive: true,
        },
      });
    }

    await prisma.invitation.update({
      where: { id: inv.id },
      data: { usedAt: new Date(), userId: user.id },
    });

    const meta = extractRequestMeta(req);
    await writeAuditLog({
      actorId: user.id,
      action: 'INVITATION_ACCEPT',
      entityType: 'Invitation',
      entityId: inv.id,
      after: { userId: user.id, role: user.role, orgId: user.organizationId },
      ...meta,
    });

    return NextResponse.json({ ok: true, userId: user.id });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}
