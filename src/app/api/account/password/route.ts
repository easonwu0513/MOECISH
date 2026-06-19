import { NextResponse } from 'next/server';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import { prisma } from '@/lib/db';
import { requireUser } from '@/lib/rbac';
import { errorResponse } from '@/lib/api';
import {
  BASELINE, validatePasswordComplexity, parsePasswordHistory, pushPasswordHistory,
} from '@/lib/security-baseline';
import { writeAuditLog, extractRequestMeta } from '@/lib/audit-log';

const Body = z.object({
  currentPassword: z.string().min(1, '請輸入目前密碼'),
  newPassword: z.string().min(8, '新密碼至少 8 字元'),
});

/** 變更自己的密碼。防護基準啟用時加驗複雜度與前三次歷史。 */
export async function POST(req: Request) {
  try {
    const sessionUser = await requireUser();
    const body = Body.parse(await req.json());

    const user = await prisma.user.findUnique({ where: { id: sessionUser.id } });
    if (!user) return NextResponse.json({ error: '帳號不存在' }, { status: 404 });

    const ok = await bcrypt.compare(body.currentPassword, user.passwordHash);
    if (!ok) return NextResponse.json({ error: '目前密碼不正確' }, { status: 400 });

    if (body.newPassword === body.currentPassword) {
      return NextResponse.json({ error: '新密碼不可與目前密碼相同' }, { status: 400 });
    }

    if (BASELINE.enabled) {
      const complexityErr = validatePasswordComplexity(body.newPassword);
      if (complexityErr) return NextResponse.json({ error: complexityErr }, { status: 400 });

      // 不可與前三次使用過之密碼相同
      const history = [user.passwordHash, ...parsePasswordHistory(user.passwordHistory)];
      for (const h of history.slice(0, BASELINE.pwHistoryCount)) {
        if (await bcrypt.compare(body.newPassword, h)) {
          return NextResponse.json(
            { error: `新密碼不可與最近 ${BASELINE.pwHistoryCount} 次使用過的密碼相同` },
            { status: 400 },
          );
        }
      }
    }

    const newHash = await bcrypt.hash(body.newPassword, 10);
    await prisma.user.update({
      where: { id: user.id },
      data: {
        passwordHash: newHash,
        passwordChangedAt: new Date(),
        mustChangePassword: false,
        passwordHistory: pushPasswordHistory(user.passwordHistory, user.passwordHash),
      },
    });

    await writeAuditLog({
      actorId: user.id,
      action: 'auth.password-changed',
      entityType: 'User',
      entityId: user.id,
      ...extractRequestMeta(req),
    });

    return NextResponse.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
