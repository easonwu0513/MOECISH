import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { requireRole } from '@/lib/rbac';
import { errorResponse } from '@/lib/api';
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

    // 群發以「收件人自身機關」代入 {{orgName}},故按主要身分綁機關查(刻意不套 orgAdminWhere:
    // 多重身分授權帳號的現用主機關可能非所選機關,套用會使 {{orgName}} 錯置。自動逾期催繳由 run-tracking 覆蓋多重身分)。
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
        subject: input.subject
          .replaceAll('{{orgName}}', r.organization?.name ?? '')
          .replaceAll('{{loginUrl}}', `${base}/login`),
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

    // 批36:被選取但「無啟用中機關管理員」的機關會被靜默略過——回傳名單讓前端警示,
    // 避免中心以為全數催辦到了(最該催的往往正是沒人維運的那家)。
    const coveredOrgIds = new Set(recipients.map((r) => r.organizationId));
    const skippedOrgIds = input.organizationIds.filter((id) => !coveredOrgIds.has(id));
    const skippedOrgs = skippedOrgIds.length
      ? (await prisma.organization.findMany({ where: { id: { in: skippedOrgIds } }, select: { name: true } })).map((o) => o.name)
      : [];
    return NextResponse.json({ sent, skippedOrgs });
  } catch (e) {
    return errorResponse(e);
  }
}
