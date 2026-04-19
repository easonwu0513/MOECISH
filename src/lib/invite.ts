import { randomBytes } from 'node:crypto';
import { prisma } from './db';
import { sendEmail } from './email';
import type { Role } from './types';

const INVITE_TTL_DAYS = 14;

export function generateInviteToken() {
  return randomBytes(32).toString('base64url');
}

export async function createInvitation(input: {
  email: string;
  name: string;
  role: Role;
  organizationId: string | null;
  createdById: string;
  appBaseUrl: string;
}) {
  // 若該 email 已有啟用帳號則拒絕
  const existing = await prisma.user.findUnique({ where: { email: input.email } });
  if (existing && existing.isActive) {
    throw new Error('該 email 已有啟用中的帳號');
  }

  // 若已有未使用邀請則失效舊的
  await prisma.invitation.updateMany({
    where: { email: input.email, usedAt: null, revokedAt: null },
    data: { revokedAt: new Date() },
  });

  const token = generateInviteToken();
  const expiresAt = new Date(Date.now() + INVITE_TTL_DAYS * 86400_000);
  const inv = await prisma.invitation.create({
    data: {
      token,
      email: input.email,
      name: input.name,
      role: input.role,
      organizationId: input.organizationId,
      createdById: input.createdById,
      expiresAt,
    },
    include: { organization: true },
  });

  const link = `${input.appBaseUrl}/invite/${token}`;
  const roleLabel: Record<Role, string> = {
    ADMIN: '平台管理員',
    AUDITOR: '稽核委員',
    RESPONDENT: '填報人',
    SUPERVISOR: '單位主管',
  };

  const body =
    `${input.name} 您好，\n\n` +
    `您已被邀請加入 MOECISH 資通安全稽核管考平台，角色為 ${roleLabel[input.role]}` +
    (inv.organization ? `（${inv.organization.name}）` : '') + `。\n\n` +
    `請於 14 日內點擊以下連結設定您的密碼完成啟用：\n${link}\n\n` +
    `若您未預期收到此信，請忽略本信件。\n\n` +
    `— MOECISH 教育部資通安全稽核改善管考系統`;

  await sendEmail({
    to: input.email,
    toName: input.name,
    subject: `[MOECISH] 邀請您加入資通安全稽核管考平台`,
    body,
    kind: 'invitation',
    relatedInvitationId: inv.id,
    context: { link, role: input.role, organizationId: input.organizationId },
  });

  return { invitation: inv, link };
}

export async function getInviteByToken(token: string) {
  const inv = await prisma.invitation.findUnique({
    where: { token },
    include: { organization: true },
  });
  if (!inv) return null;
  return inv;
}

export function inviteStatus(inv: {
  usedAt: Date | null;
  revokedAt: Date | null;
  expiresAt: Date;
}): 'pending' | 'used' | 'revoked' | 'expired' {
  if (inv.usedAt) return 'used';
  if (inv.revokedAt) return 'revoked';
  if (inv.expiresAt.getTime() < Date.now()) return 'expired';
  return 'pending';
}
