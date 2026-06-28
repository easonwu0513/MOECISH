import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { assertCycleAccess } from '@/lib/rbac';
import { errorResponse } from '@/lib/api';
import { sendEmail } from '@/lib/email';
import { writeAuditLog, extractRequestMeta } from '@/lib/audit-log';
import { appBaseUrl } from '@/lib/baseUrl';
import { fmtROC } from '@/lib/date';

const Body = z.object({ category: z.enum(['TECH', 'ONSITE']) });
const CAT_LABEL: Record<string, string> = { TECH: '技術檢測', ONSITE: '實地稽核' };

/**
 * 中心(最高管理員)對受稽機關「催繳」稽核前資料:寄信提醒機關管理員儘速上傳/繳交。
 * 由人工點擊觸發(非自動排程);24h 內同機關同區去重避免重複轟炸。
 */
export async function POST(req: Request, { params }: { params: { id: string } }) {
  try {
    const { user, cycle } = await assertCycleAccess(params.id);
    if (user.role !== 'SUPER_ADMIN') {
      return NextResponse.json({ error: '僅中心(最高管理員)可催繳' }, { status: 403 });
    }
    const { category } = Body.parse(await req.json());

    const org = await prisma.organization.findUnique({
      where: { id: cycle.organizationId },
      select: { name: true },
    });
    const admins = await prisma.user.findMany({
      where: { organizationId: cycle.organizationId, role: 'ORG_ADMIN', isActive: true },
      select: { id: true, name: true, email: true },
    });
    if (admins.length === 0) {
      return NextResponse.json({ error: '該機關尚無啟用中的機關管理員可通知' }, { status: 400 });
    }

    const due = category === 'TECH' ? cycle.prepDueTech : cycle.prepDueDate;
    const overdue = !!due && new Date(due) < new Date();
    const yearROC = cycle.year - 1911;
    const catLabel = CAT_LABEL[category];
    const link = `${appBaseUrl(req)}/cycles/${cycle.id}/prep`;
    const dueStr = due ? fmtROC(due) : null;

    const subject = `[MOECISH] 稽核前資料催繳(${catLabel})— ${yearROC} 年度`;
    const body =
      `您好,\n\n` +
      `貴機關 ${yearROC} 年度資通安全稽核「${catLabel}」應備資料` +
      (dueStr ? `(繳交截止 ${dueStr})` : '') +
      (overdue ? ',已逾期' : '') +
      `,尚有項目待繳交。請儘速登入系統上傳檔案或敘明無相關文件理由,並按「確定繳交」送交中心:\n\n` +
      `${link}\n\n` +
      `— 教育部轄下醫療領域資訊安全推動中心(系統催繳通知)`;

    let sent = 0;
    for (const a of admins) {
      await sendEmail({
        to: a.email,
        toName: a.name,
        subject,
        body,
        kind: 'tracking',
        relatedCycleId: cycle.id,
        context: { remindCategory: category, manual: true, by: user.name },
        dedupeKey: `prep-remind:${cycle.id}:${category}`, // 24h 內同區去重
      });
      sent += 1;
    }

    await writeAuditLog({
      actorId: user.id,
      action: 'prep.remind',
      entityType: 'AuditCycle',
      entityId: cycle.id,
      after: { category, recipients: sent, overdue },
      ...extractRequestMeta(req),
    });

    return NextResponse.json({ ok: true, sent, org: org?.name });
  } catch (e) {
    return errorResponse(e);
  }
}
