import { prisma } from './db';
import { sendEmail } from './email';

/**
 * 通知指定稽核週期對應機關的填報人員（RESPONDENT + SUPERVISOR）
 * 建議與 AuditLog 串在一起、回傳寄送摘要。
 */
export async function notifyCycleRespondents(opts: {
  cycleId: string;
  triggeredById: string;
  appBaseUrl: string;
}) {
  const cycle = await prisma.auditCycle.findUnique({
    where: { id: opts.cycleId },
    include: { organization: true },
  });
  if (!cycle) throw new Error('稽核週期不存在');

  const recipients = await prisma.user.findMany({
    where: {
      organizationId: cycle.organizationId,
      role: { in: ['RESPONDENT', 'SUPERVISOR'] },
      isActive: true,
    },
  });

  const link = `${opts.appBaseUrl}/cycles/${cycle.id}`;
  const yearROC = cycle.year - 1911;
  const due = new Date(cycle.dueDate).toLocaleDateString('zh-TW');

  const results = await Promise.all(
    recipients.map((u) =>
      sendEmail({
        to: u.email,
        toName: u.name,
        subject: `[MOECISH] ${yearROC} 年度資通安全稽核開始填報`,
        body:
          `${u.name} 您好，\n\n` +
          `${cycle.organization.name} 的 ${yearROC} 年度資通安全稽核週期已建立，請於 ${due} 前完成檢核表填報：\n\n` +
          `${link}\n\n` +
          `— MOECISH 教育部資通安全稽核改善管考系統`,
        kind: 'cycle-notify',
        relatedCycleId: cycle.id,
        context: { role: u.role },
      }),
    ),
  );

  return {
    cycleId: cycle.id,
    recipientCount: recipients.length,
    emailIds: results.map((r) => r.id),
  };
}
