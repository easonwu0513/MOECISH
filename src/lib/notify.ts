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
          `— MOECISH 資通安全稽核管考平台`,
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

/** 機關送審後通知該週期受指派之稽核委員(有件待審)。 */
export async function notifyAuditorsOnSubmit(opts: {
  deficiencyId: string;
  appBaseUrl: string;
}) {
  const def = await prisma.deficiency.findUnique({
    where: { id: opts.deficiencyId },
    include: { cycle: { include: { organization: true, assignments: true } } },
  });
  if (!def) return { recipientCount: 0 };
  const cycle = def.cycle;

  const auditors = await prisma.user.findMany({
    where: {
      id: { in: cycle.assignments.map((a) => a.auditorId) },
      isActive: true,
    },
  });
  if (auditors.length === 0) return { recipientCount: 0 };

  const link = `${opts.appBaseUrl}/cycles/${cycle.id}/deficiencies?status=submitted`;
  const yearROC = cycle.year - 1911;
  const orgName = cycle.organization.shortName ?? cycle.organization.name;

  await Promise.all(
    auditors.map((u) =>
      sendEmail({
        to: u.email,
        toName: u.name,
        subject: `[MOECISH] ${orgName} 已送審矯正措施(第 ${def.itemNo} 項),請撥冗審查`,
        body:
          `${u.name} 委員您好,\n\n` +
          `${cycle.organization.name} 於 ${yearROC} 年度稽核已送審 1 項矯正措施,\n` +
          `請登入系統檢視填報內容與佐證並進行審查:\n\n` +
          `${link}\n\n` +
          `— MOECISH 資通安全稽核管考平台`,
        kind: 'review-request',
        relatedCycleId: cycle.id,
        context: { deficiencyId: def.id, itemNo: def.itemNo },
      }),
    ),
  );
  return { recipientCount: auditors.length };
}

/** 委員退回後通知機關管理員(帶退回理由與直達連結)。 */
export async function notifyOrgOnReturn(opts: {
  deficiencyId: string;
  comment: string;
  round: number;
  appBaseUrl: string;
}) {
  const def = await prisma.deficiency.findUnique({
    where: { id: opts.deficiencyId },
    include: { cycle: { include: { organization: true } } },
  });
  if (!def) return { recipientCount: 0 };
  const cycle = def.cycle;

  const recipients = await prisma.user.findMany({
    where: { organizationId: cycle.organizationId, role: 'ORG_ADMIN', isActive: true },
  });
  if (recipients.length === 0) return { recipientCount: 0 };

  const link = `${opts.appBaseUrl}/cycles/${cycle.id}/deficiencies/${def.id}`;
  const yearROC = cycle.year - 1911;

  await Promise.all(
    recipients.map((u) =>
      sendEmail({
        to: u.email,
        toName: u.name,
        subject: `[MOECISH] 矯正措施被退回補正(第 ${def.itemNo} 項),請儘速處理`,
        body:
          `${u.name} 您好,\n\n` +
          `${cycle.organization.name} ${yearROC} 年度稽核之第 ${def.itemNo} 項矯正措施經委員審查退回(第 ${opts.round} 輪)。\n\n` +
          `退回理由:\n${opts.comment}\n\n` +
          `請依意見補正後重新送審:\n${link}\n\n` +
          `— MOECISH 資通安全稽核管考平台`,
        kind: 'action-returned',
        relatedCycleId: cycle.id,
        context: { deficiencyId: def.id, itemNo: def.itemNo, round: opts.round },
      }),
    ),
  );
  return { recipientCount: recipients.length };
}

/** 全數矯正通過後通知機關:列印改善報告、用印上傳。 */
export async function notifyOrgAllPassed(opts: { cycleId: string; appBaseUrl: string }) {
  const cycle = await prisma.auditCycle.findUnique({
    where: { id: opts.cycleId },
    include: { organization: true },
  });
  if (!cycle) return { recipientCount: 0 };

  const recipients = await prisma.user.findMany({
    where: { organizationId: cycle.organizationId, role: 'ORG_ADMIN', isActive: true },
  });
  if (recipients.length === 0) return { recipientCount: 0 };

  const link = `${opts.appBaseUrl}/cycles/${cycle.id}`;
  const yearROC = cycle.year - 1911;

  await Promise.all(
    recipients.map((u) =>
      sendEmail({
        to: u.email,
        toName: u.name,
        subject: `[MOECISH] ${yearROC} 年度矯正措施全數通過,請列印改善報告用印回傳`,
        body:
          `${u.name} 您好,\n\n` +
          `${cycle.organization.name} ${yearROC} 年度資通安全稽核之矯正措施已全數審查通過。\n` +
          `請至系統列印「資通安全稽核改善暨執行情形報告」,完成機關用印後將掃描檔上傳,以利結案:\n\n` +
          `${link}\n\n` +
          `— MOECISH 資通安全稽核管考平台`,
        kind: 'all-passed',
        relatedCycleId: cycle.id,
        context: {},
      }),
    ),
  );
  return { recipientCount: recipients.length };
}
