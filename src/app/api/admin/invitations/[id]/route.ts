import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireRole } from '@/lib/rbac';
import { errorResponse } from '@/lib/api';
import { inviteStatus } from '@/lib/invite';
import { sendEmail } from '@/lib/email';
import { appBaseUrl } from '@/lib/baseUrl';
import { writeAuditLog, extractRequestMeta } from '@/lib/audit-log';
import type { Role } from '@/lib/types';

/** 撤銷邀請(打錯 email 不用等 14 天過期)。 */
export async function DELETE(req: Request, { params }: { params: { id: string } }) {
  try {
    const user = await requireRole('SUPER_ADMIN');
    const inv = await prisma.invitation.findUnique({ where: { id: params.id } });
    if (!inv) return NextResponse.json({ error: '邀請不存在' }, { status: 404 });
    if (inviteStatus(inv) !== 'pending') {
      return NextResponse.json({ error: '僅能撤銷待接受的邀請' }, { status: 400 });
    }

    await prisma.invitation.update({
      where: { id: inv.id },
      data: { revokedAt: new Date() },
    });

    const meta = extractRequestMeta(req);
    await writeAuditLog({
      actorId: user.id,
      action: 'INVITATION_REVOKE',
      entityType: 'Invitation',
      entityId: inv.id,
      before: { email: inv.email },
      ...meta,
    });

    return NextResponse.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}

/** 重寄邀請信(同一連結,效期重新展延 14 天)。 */
export async function POST(req: Request, { params }: { params: { id: string } }) {
  try {
    const user = await requireRole('SUPER_ADMIN');
    const inv = await prisma.invitation.findUnique({
      where: { id: params.id },
      include: { organization: true },
    });
    if (!inv) return NextResponse.json({ error: '邀請不存在' }, { status: 404 });
    const st = inviteStatus(inv);
    if (st === 'used' || st === 'revoked') {
      return NextResponse.json({ error: '此邀請已使用或已撤銷,請建立新邀請' }, { status: 400 });
    }

    const expiresAt = new Date(Date.now() + 14 * 86400_000);
    await prisma.invitation.update({ where: { id: inv.id }, data: { expiresAt } });

    const link = `${appBaseUrl(req)}/invite/${inv.token}`;
    const roleLabel: Record<Role, string> = {
      SUPER_ADMIN: '最高管理員',
      AUDITOR: '稽核委員',
      ORG_ADMIN: '機關管理員',
    };
    await sendEmail({
      to: inv.email,
      toName: inv.name,
      subject: '[MOECISH] 邀請您加入資通安全稽核管考平台(重寄)',
      body:
        `${inv.name} 您好,\n\n` +
        `提醒您:您已被邀請加入 MOECISH 資通安全稽核管考平台,角色為 ${roleLabel[inv.role as Role]}` +
        (inv.organization ? `(${inv.organization.name})` : '') + `。\n\n` +
        `請於 14 日內點擊以下連結設定您的密碼完成啟用:\n${link}\n\n` +
        `若您未預期收到此信,請忽略本信件。\n\n` +
        `— MOECISH 資通安全稽核管考平台`,
      kind: 'invitation',
      relatedInvitationId: inv.id,
      context: { link, resend: true },
    });

    const meta = extractRequestMeta(req);
    await writeAuditLog({
      actorId: user.id,
      action: 'INVITATION_RESEND',
      entityType: 'Invitation',
      entityId: inv.id,
      after: { email: inv.email, expiresAt },
      ...meta,
    });

    return NextResponse.json({ ok: true, link });
  } catch (e) {
    return errorResponse(e);
  }
}
