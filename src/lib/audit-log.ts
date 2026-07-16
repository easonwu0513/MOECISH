import { createHash } from 'node:crypto';
import { prisma } from './db';
import { BASELINE } from './security-baseline';

/**
 * 稽核軌跡寫入。
 * 防護基準(中級)啟用時,每筆以雜湊鏈確保完整性:
 *   chainHash = sha256(前一筆 chainHash + 本筆固定欄位序列化)
 * 任何一筆遭竄改即斷鏈,可用 npm run audit:verify-chain 驗證。
 */
export async function writeAuditLog(opts: {
  actorId?: string | null;
  action: string;
  entityType: string;
  entityId: string;
  before?: unknown;
  after?: unknown;
  ipAddress?: string | null;
  userAgent?: string | null;
}) {
  const data = {
    actorId: opts.actorId ?? null,
    action: opts.action,
    entityType: opts.entityType,
    entityId: opts.entityId,
    beforeJson: opts.before ? JSON.stringify(opts.before) : null,
    afterJson: opts.after ? JSON.stringify(opts.after) : null,
    ipAddress: opts.ipAddress ?? null,
    userAgent: opts.userAgent ?? null,
  };

  if (!BASELINE.enabled) {
    await prisma.auditLog.create({ data });
    return;
  }

  // 雜湊鏈:以 Serializable 交易「讀前筆 → 算鏈 → 寫本筆」,避免兩筆並行皆讀到同一 prev.chainHash
  // 造成鏈分叉(Read Committed 下會發生,侵蝕完整性日誌可信度)。序列化衝突(P2034)退避重試,重讀 prev 重算鏈。
  const MAX_ATTEMPTS = 5;
  for (let attempt = 1; ; attempt++) {
    try {
      await prisma.$transaction(async (tx) => {
        const prev = await tx.auditLog.findFirst({
          where: { chainHash: { not: null } },
          orderBy: { createdAt: 'desc' },
          select: { chainHash: true },
        });
        const payload = JSON.stringify([
          prev?.chainHash ?? 'GENESIS',
          data.actorId, data.action, data.entityType, data.entityId,
          data.beforeJson, data.afterJson, data.ipAddress,
        ]);
        const chainHash = createHash('sha256').update(payload, 'utf8').digest('hex');
        await tx.auditLog.create({ data: { ...data, chainHash } });
      }, { isolationLevel: 'Serializable' });
      return;
    } catch (e) {
      if ((e as { code?: string }).code === 'P2034' && attempt < MAX_ATTEMPTS) {
        await new Promise((r) => setTimeout(r, 10 * attempt));
        continue;
      }
      throw e;
    }
  }
}

export function extractRequestMeta(req: Request) {
  const h = req.headers;
  return {
    ipAddress:
      h.get('x-forwarded-for')?.split(',')[0]?.trim() ??
      h.get('x-real-ip') ??
      null,
    userAgent: h.get('user-agent') ?? null,
  };
}
