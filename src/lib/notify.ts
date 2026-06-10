import { prisma } from './db';
import { sendEmail } from './email';

/**
 * 通知稽核週期所屬機關的機關管理員（ORG_ADMIN）。
 * 用於:缺失發布後開放填報、追蹤提醒。
 */
export async function notifyCycleOrgAdmins(opts: {
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
      role: 'ORG_ADMIN',
      isActive: true,
    },
  });

  const link = `${opts.appBaseUrl}/cycles/${cycle.id}/deficiencies`;
  const yearROC = cycle.year - 1911;
  const due = new Date(cycle.dueDate).toLocaleDateString('zh-TW');

  const results = await Promise.all(
    recipients.map((u) =>
      sendEmail({
        to: u.email,
        toName: u.name,
        subject: `[MOECISH] ${yearROC} 年度稽核缺失已發布，請填報矯正措施`,
        body:
          `${u.name} 您好，\n\n` +
          `${cycle.organization.name} 的 ${yearROC} 年度資通安全稽核缺失已發布，` +
          `請於 ${due} 前完成矯正措施填報與佐證上傳：\n\n` +
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
