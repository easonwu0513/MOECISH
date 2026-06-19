import { NextResponse } from 'next/server';
import { requireRole } from '@/lib/rbac';
import { errorResponse } from '@/lib/api';
import { notifyCycleOrgAdmins } from '@/lib/notify';
import { appBaseUrl } from '@/lib/baseUrl';
import { writeAuditLog, extractRequestMeta } from '@/lib/audit-log';

export async function POST(req: Request, { params }: { params: { id: string } }) {
  try {
    const user = await requireRole('SUPER_ADMIN');
    const result = await notifyCycleOrgAdmins({
      cycleId: params.id,
      triggeredById: user.id,
      appBaseUrl: appBaseUrl(req),
    });

    const meta = extractRequestMeta(req);
    await writeAuditLog({
      actorId: user.id,
      action: 'CYCLE_NOTIFY_ORG_ADMINS',
      entityType: 'AuditCycle',
      entityId: params.id,
      after: result,
      ...meta,
    });

    return NextResponse.json(result);
  } catch (e) {
    return errorResponse(e);
  }
}
