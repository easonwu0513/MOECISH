import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireRole } from '@/lib/rbac';
import { errorResponse } from '@/lib/api';
import { createPasswordResetToken } from '@/lib/password-reset';
import { sendEmail } from '@/lib/email';
import { appBaseUrl } from '@/lib/baseUrl';
import { writeAuditLog, extractRequestMeta } from '@/lib/audit-log';

/**
 * 最高管理員手動寄送某使用者的密碼重設連結(24 小時有效)。
 * 回傳 link 供管理員自行複製轉交(demo/現場 email 未必實寄);同時嘗試寄信。
 */
export async function POST(req: Request, { params }: { params: { id: string } }) {
  try {
    const admin = await requireRole('SUPER_ADMIN');
    const user = await prisma.user.findUnique({ where: { id: params.id } });
    if (!user || !user.isActive) {
      return NextResponse.json({ error: '使用者不存在或已停用' }, { status: 404 });
    }

    const token = await createPasswordResetToken(user.id, { ttlHours: 24, createdByAdminId: admin.id });
    const link = `${appBaseUrl(req)}/reset-password?token=${token}`;

    let delivered = false;
    try {
      const log = await sendEmail({
        to: user.email,
        toName: user.name,
        subject: '[MOECISH] 管理員已為您產生密碼重設連結',
        body:
          `${user.name} 您好,\n\n` +
          '系統管理員已為您產生密碼重設連結。請於 24 小時內點擊以下連結設定新密碼:\n\n' +
          `${link}\n\n` +
          '若您並未提出此需求,請洽系統管理員。\n\n' +
          '— MOECISH 資通安全稽核管考平台',
        kind: 'password-reset',
      });
      delivered = log.status === 'sent';
    } catch (e) {
      console.error('[admin reset] 寄信失敗:', (e as Error).message);
    }

    await writeAuditLog({
      actorId: admin.id,
      action: 'auth.password-reset-admin',
      entityType: 'User',
      entityId: user.id,
      after: { targetEmail: user.email, delivered },
      ...extractRequestMeta(req),
    });
    return NextResponse.json({ ok: true, link, delivered });
  } catch (e) {
    return errorResponse(e);
  }
}
