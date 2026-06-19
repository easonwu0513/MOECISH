import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { requireRole, AuthError } from '@/lib/rbac';
import { sendEmail } from '@/lib/email';
import { appBaseUrl } from '@/lib/baseUrl';
import { writeAuditLog, extractRequestMeta } from '@/lib/audit-log';

const Body = z.object({
  organizationIds: z.array(z.string().min(1)).min(1, '請選擇至少一個機關'),
  subject: z.string().min(2, '請輸入主旨'),
  body: z.string().min(5, '請輸入內文'),
});

/**
 * 最高管理員手動追蹤信:群發給所選機關之全部機關管理員。
 * 內文支援變數:{{orgName}} {{loginUrl}}
 */
export async function POST(req: Request) {
  try {
    const user = await requireRole('SUPER_ADMIN');
    const input = Body.parse(await req.json());
    const base = appBaseUrl(req);

    const recipients = await prisma.user.findMany({
      where: {
        organizationId: { in: input.organizationIds },
        role: 'ORG_ADMIN',
        isActive: true,
      },
      include: { organization: true },
    });
    if (recipients.length === 0) {
      return NextResponse.json({ error: '所選機關沒有有效的機關管理員' }, { status: 400 });
    }

    let sent = 0;
    for (const r of recipients) {
      const body = input.body
        .replaceAll('{{orgName}}', r.organization?.name ?? '')
        .replaceAll('{{loginUrl}}', `${base}/login`);
      await sendEmail({
        to: r.email,
        toName: r.name,
        subject: input.subject,
        body,
        kind: 'tracking',
        context: { organizationId: r.organizationId, triggeredBy: user.id },
      });
      sent++;
    }

    const meta = extractRequestMeta(req);
    await writeAuditLog({
      actorId: user.id,
      action: 'TRACKING_SEND',
      entityType: 'EmailLog',
      entityId: 'batch',
      after: { organizationIds: input.organizationIds, sent },
      ...meta,
    });

    return NextResponse.json({ sent });
  } catch (e) {
    if (e instanceof AuthError) return NextResponse.json({ error: e.message }, { status: e.status });
    if (e instanceof z.ZodError) return NextResponse.json({ error: e.errors[0]?.message ?? '輸入有誤' }, { status: 400 });
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}
