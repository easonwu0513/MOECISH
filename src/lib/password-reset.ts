import crypto from 'node:crypto';
import { prisma } from './db';

/**
 * 密碼重設 token:明文只放連結,DB 存 SHA-256 雜湊(比對用);單次使用、有期限。
 * 自助忘記密碼 1 小時、管理員手動寄送 24 小時。
 */

function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

/**
 * 產生一次性重設 token,回傳「明文 token」(僅供組連結/寄信;DB 只存雜湊)。
 * 同時撤銷該 user 先前未使用的 token(舊連結一律失效,單一有效連結)。
 */
export async function createPasswordResetToken(
  userId: string,
  opts: { ttlHours: number; createdByAdminId?: string | null },
): Promise<string> {
  const token = crypto.randomBytes(32).toString('hex'); // 256-bit,64 hex 字元
  const tokenHash = hashToken(token);
  const expiresAt = new Date(Date.now() + opts.ttlHours * 60 * 60 * 1000);
  await prisma.$transaction([
    prisma.passwordResetToken.deleteMany({ where: { userId, usedAt: null } }),
    prisma.passwordResetToken.create({
      data: { userId, tokenHash, expiresAt, createdByAdminId: opts.createdByAdminId ?? null },
    }),
  ]);
  return token;
}

export type ResetTokenCheck =
  | { ok: true; userId: string }
  | { ok: false; reason: 'invalid' | 'expired' | 'used' };

/** 驗證明文 token 是否可用(不消費);供重設頁決定顯示表單或錯誤。 */
export async function checkPasswordResetToken(token: string | null | undefined): Promise<ResetTokenCheck> {
  const t = (token ?? '').trim();
  if (!t) return { ok: false, reason: 'invalid' };
  const rec = await prisma.passwordResetToken.findUnique({ where: { tokenHash: hashToken(t) } });
  if (!rec) return { ok: false, reason: 'invalid' };
  if (rec.usedAt) return { ok: false, reason: 'used' };
  if (rec.expiresAt.getTime() < Date.now()) return { ok: false, reason: 'expired' };
  return { ok: true, userId: rec.userId };
}

export const RESET_TOKEN_HASH = hashToken; // 供消費 token 的 route 於交易內以 tokenHash 定位
