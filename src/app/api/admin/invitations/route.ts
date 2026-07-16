import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireRole } from '@/lib/rbac';
import { errorResponse } from '@/lib/api';
import { createInvitation } from '@/lib/invite';
import { appBaseUrl } from '@/lib/baseUrl';
import { writeAuditLog, extractRequestMeta } from '@/lib/audit-log';
import { ROLES } from '@/lib/types';

const Body = z.object({
  email: z.string().email(),
  name: z.string().min(1).max(100),
  role: z.enum(ROLES),
  organizationId: z.string().nullable().optional(),
}).superRefine((v, ctx) => {
  // role ↔ organizationId 一致性:機關管理員必綁機關;其餘角色不得帶機關
  if (v.role === 'ORG_ADMIN' && !v.organizationId) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['organizationId'], message: '機關管理員必須指定所屬機關' });
  }
  if (v.role !== 'ORG_ADMIN' && v.organizationId) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['organizationId'], message: '此角色不應指定所屬機關' });
  }
});

export async function POST(req: Request) {
  try {
    const user = await requireRole('SUPER_ADMIN');
    const body = Body.parse(await req.json());

    const { invitation, link, delivered } = await createInvitation({
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

    return NextResponse.json({ invitation, link, delivered });
  } catch (e) {
    return errorResponse(e);
  }
}
