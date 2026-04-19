import { NextResponse } from 'next/server';
import { requireRole, AuthError } from '@/lib/rbac';
import { notifyCycleRespondents } from '@/lib/notify';
import { appBaseUrl } from '@/lib/baseUrl';
import { writeAuditLog, extractRequestMeta } from '@/lib/audit-log';

export async function POST(req: Request, { params }: { params: { id: string } }) {
  try {
    const user = await requireRole('ADMIN', 'AUDITOR');
    const result = await notifyCycleRespondents({
      cycleId: params.id,
      triggeredById: user.id,
      appBaseUrl: appBaseUrl(req),
    });

    const meta = extractRequestMeta(req);
    await writeAuditLog({
      actorId: user.id,
      action: 'CYCLE_NOTIFY_RESPONDENTS',
      entityType: 'AuditCycle',
      entityId: params.id,
      after: result,
      ...meta,
    });

    return NextResponse.json(result);
  } catch (e) {
    if (e instanceof AuthError) return NextResponse.json({ error: e.message }, { status: e.status });
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}
