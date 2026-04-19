import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireRole, AuthError } from '@/lib/rbac';
import { createInvitation } from '@/lib/invite';
import { appBaseUrl } from '@/lib/baseUrl';
import { writeAuditLog, extractRequestMeta } from '@/lib/audit-log';
import { ROLES } from '@/lib/types';

const Body = z.object({
  email: z.string().email(),
  name: z.string().min(1),
  role: z.enum(ROLES),
  organizationId: z.string().nullable().optional(),
});

export async function POST(req: Request) {
  try {
    const user = await requireRole('ADMIN');
    const body = Body.parse(await req.json());

    const { invitation, link } = await createInvitation({
      email: body.email,
      name: body.name,
      role: body.role,
      organizationId: body.organizationId ?? null,
      createdById: user.id,
      appBaseUrl: appBaseUrl(req),
    });

    const meta = extractRequestMeta(req);
    await writeAuditLog({
      actorId: user.id,
      action: 'INVITATION_CREATE',
      entityType: 'Invitation',
      entityId: invitation.id,
      after: { email: invitation.email, role: invitation.role, orgId: invitation.organizationId },
      ...meta,
    });

    return NextResponse.json({ invitation, link });
  } catch (e) {
    if (e instanceof AuthError) return NextResponse.json({ error: e.message }, { status: e.status });
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}
