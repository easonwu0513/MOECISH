import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { requireUser } from '@/lib/rbac';
import { errorResponse } from '@/lib/api';
import { listIdentities } from '@/lib/identity';
import { ROLES } from '@/lib/types';
import { writeAuditLog, extractRequestMeta } from '@/lib/audit-log';

/** 列出本帳號可用身分(切換選單資料;僅本人)。 */
export async function GET() {
  try {
    const user = await requireUser();
    const identities = await listIdentities(user.id);
    return NextResponse.json(
      { identities },
      { headers: { 'Cache-Control': 'private, no-store' } },
    );
  } catch (e) {
    return errorResponse(e);
  }
}

const SwitchBody = z.object({
  role: z.enum(ROLES),
  organizationId: z.string().nullable().optional(),
});

/**
 * 切換現用身分(批31/方案A):驗證目標身分在本帳號「有效授權集合」內(伺服器端權威驗證,
 * 不信 client 宣稱)→ 改寫 User.role/organizationId → audit-log。下一請求 jwt callback
 * 回查 DB 即同步 session(全域生效,非分頁各自身分——避免同瀏覽器雙身分併行的權限混淆)。
 */
export async function POST(req: Request) {
  try {
    const user = await requireUser();
    const body = SwitchBody.parse(await req.json());
    const targetOrg = body.organizationId ?? null;

    const identities = await listIdentities(user.id);
    const target = identities.find((i) => i.role === body.role && i.organizationId === targetOrg);
    if (!target) {
      return NextResponse.json({ error: '您的帳號未持有此身分授權' }, { status: 403 });
    }
    if (target.current) return NextResponse.json({ ok: true, unchanged: true });

    const before = { role: user.role, organizationId: user.organizationId ?? null };
    await prisma.user.update({
      where: { id: user.id },
      data: { role: target.role, organizationId: target.organizationId },
    });

    await writeAuditLog({
      actorId: user.id,
      action: 'IDENTITY_SWITCH',
      entityType: 'User',
      entityId: user.id,
      before,
      after: { role: target.role, organizationId: target.organizationId },
      ...extractRequestMeta(req),
    });

    return NextResponse.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
