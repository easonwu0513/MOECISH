import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { errorResponse } from '@/lib/api';
import { createPasswordResetToken } from '@/lib/password-reset';
import { sendEmail } from '@/lib/email';
import { appBaseUrl } from '@/lib/baseUrl';
import { writeAuditLog, extractRequestMeta } from '@/lib/audit-log';

const Body = z.object({ email: z.string().email() });

/**
 * 自助「忘記密碼」:寄送重設連結(1 小時有效)。
 * 防帳號枚舉:不論 email 是否存在/格式是否正確,一律回相同成功訊息(不洩露帳號是否存在)。
 * 輕量節流:同一使用者 60 秒內已產生過 token 則不重寄(避免信箱轟炸)。
 */
export async function POST(req: Request) {
  try {
    const parsed = Body.safeParse(await req.json().catch(() => ({})));
    if (parsed.success) {
      const email = parsed.data.email.trim().toLowerCase();
      const user = await prisma.user.findFirst({ where: { email, isActive: true } });
      if (user) {
        const recent = await prisma.passwordResetToken.findFirst({
          where: { userId: user.id, usedAt: null }, // 僅未使用者計入節流,避免剛完成重設者的合法重寄被誤擋
          orderBy: { createdAt: 'desc' },
        });
        const throttled = recent && Date.now() - recent.createdAt.getTime() < 60_000;
        if (!throttled) {
          const token = await createPasswordResetToken(user.id, { ttlHours: 1 });
          const link = `${appBaseUrl(req)}/reset-password?token=${token}`;
          try {
            await sendEmail({
              to: user.email,
              toName: user.name,
              subject: '[MOECISH] 重設您的密碼',
              body:
                `${user.name} 您好，\n\n` +
                '我們收到您的密碼重設要求。請於 1 小時內點擊以下連結設定新密碼：\n\n' +
                `${link}\n\n` +
                '若非您本人操作，請忽略此信，您的密碼不會被變更。\n\n' +
                '— MOECISH 資通安全稽核管考平台',
              kind: 'password-reset',
            });
          } catch (e) {
            console.error('[forgot-password] 寄信失敗：', (e as Error).message);
          }
          await writeAuditLog({
            actorId: user.id,
            action: 'auth.password-reset-requested',
            entityType: 'User',
            entityId: user.id,
            ...extractRequestMeta(req),
          });
        }
      }
    }
    // 一律相同回覆(防枚舉)
    return NextResponse.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
