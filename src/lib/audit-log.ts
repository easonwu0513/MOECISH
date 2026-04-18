import { prisma } from './db';

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
  await prisma.auditLog.create({
    data: {
      actorId: opts.actorId ?? null,
      action: opts.action,
      entityType: opts.entityType,
      entityId: opts.entityId,
      beforeJson: opts.before ? JSON.stringify(opts.before) : null,
      afterJson: opts.after ? JSON.stringify(opts.after) : null,
      ipAddress: opts.ipAddress ?? null,
      userAgent: opts.userAgent ?? null,
    },
  });
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
