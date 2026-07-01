import { NextResponse } from 'next/server';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import { prisma } from '@/lib/db';
import { errorResponse } from '@/lib/api';
import { RESET_TOKEN_HASH } from '@/lib/password-reset';
import { BASELINE, validatePasswordComplexity, parsePasswordHistory, pushPasswordHistory } from '@/lib/security-baseline';
import { writeAuditLog, extractRequestMeta } from '@/lib/audit-log';

const Body = z.object({
  token: z.string().min(1),
  password: z.string().min(8, '新密碼至少 8 字元').max(128),
});

/**
 * 以重設 token 設定新密碼(自助忘記密碼 / 管理員寄送共用)。
 * 密碼政策同「變更密碼」:防護基準啟用時加驗複雜度與前 N 次歷史。
 * 原子消費 token(updateMany where usedAt=null),防同一連結並行雙用。
 */
export async function POST(req: Request) {
  try {
    const body = Body.parse(await req.json());
    const tokenHash = RESET_TOKEN_HASH(body.token.trim());
    const rec = await prisma.passwordResetToken.findUnique({ where: { tokenHash }, include: { user: true } });
    if (!rec || rec.usedAt || rec.expiresAt.getTime() < Date.now()) {
      return NextResponse.json({ error: '連結無效或已過期,請重新申請忘記密碼' }, { status: 400 });
    }
    const user = rec.user;
    if (!user.isActive) {
      return NextResponse.json({ error: '此帳號已停用,無法重設密碼,請洽系統管理員' }, { status: 400 });
    }

    if (BASELINE.enabled) {
      const complexityErr = validatePasswordComplexity(body.password);
      if (complexityErr) return NextResponse.json({ error: complexityErr }, { status: 400 });
      const history = [user.passwordHash, ...parsePasswordHistory(user.passwordHistory)];
      for (const h of history.slice(0, BASELINE.pwHistoryCount)) {
        if (await bcrypt.compare(body.password, h)) {
          return NextResponse.json(
            { error: `新密碼不可與最近 ${BASELINE.pwHistoryCount} 次使用過的密碼相同` },
            { status: 400 },
          );
        }
      }
    }

    const newHash = await bcrypt.hash(body.password, 10);
    await prisma.$transaction(async (tx) => {
      // 原子:僅在 token 仍未使用時蓋章,count=0 代表已被並行請求消費
      const claim = await tx.passwordResetToken.updateMany({
        where: { id: rec.id, usedAt: null },
        data: { usedAt: new Date() },
      });
      if (claim.count === 0) throw new Error('TOKEN_ALREADY_USED');
      await tx.user.update({
        where: { id: user.id },
        data: {
          passwordHash: newHash,
          passwordChangedAt: new Date(),
          mustChangePassword: false,
          passwordHistory: pushPasswordHistory(user.passwordHistory, user.passwordHash),
          failedLoginCount: 0,   // 重設密碼視為恢復存取,清除失敗次數與鎖定
          lockedUntil: null,
        },
      });
      await tx.passwordResetToken.deleteMany({ where: { userId: user.id, usedAt: null } });
    });

    await writeAuditLog({
      actorId: user.id,
      action: 'auth.password-reset',
      entityType: 'User',
      entityId: user.id,
      ...extractRequestMeta(req),
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    if ((e as Error).message === 'TOKEN_ALREADY_USED') {
      return NextResponse.json({ error: '連結已被使用,請重新申請忘記密碼' }, { status: 400 });
    }
    return errorResponse(e);
  }
}
