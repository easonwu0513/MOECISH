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

/** 機關完成檢核表填報送出 → 通知受指派委員(無委員時通知最高管理員)。 */
export async function notifyChecklistSubmitted(opts: {
  cycleId: string;
  submittedByName: string;
  appBaseUrl: string;
}) {
  const cycle = await prisma.auditCycle.findUnique({
    where: { id: opts.cycleId },
    include: { organization: true, assignments: true },
  });
  if (!cycle) return { recipientCount: 0 };

  let recipients = await prisma.user.findMany({
    where: { id: { in: cycle.assignments.map((a) => a.auditorId) }, isActive: true },
  });
  // 尚未指派委員時改通知最高管理員,避免送出後沒人知道
  if (recipients.length === 0) {
    recipients = await prisma.user.findMany({
      where: { role: 'SUPER_ADMIN', isActive: true },
    });
  }
  if (recipients.length === 0) return { recipientCount: 0 };

  const link = `${opts.appBaseUrl}/cycles/${cycle.id}/review`;
  const yearROC = cycle.year - 1911;
  const orgName = cycle.organization.shortName ?? cycle.organization.name;

  await Promise.all(
    recipients.map((u) =>
      sendEmail({
        to: u.email,
        toName: u.name,
        subject: `[MOECISH] ${orgName} 已完成 ${yearROC} 年度檢核表填報,請開始審閱`,
        body:
          `${u.name} 您好,\n\n` +
          `${cycle.organization.name} 已於本日由 ${opts.submittedByName} 完成 ${yearROC} 年度資通安全檢核表填報並送出,內容已鎖定。\n` +
          `請登入系統審閱填報內容(可逐題留意見;如需機關補正可退回重填):\n\n` +
          `${link}\n\n` +
          `— MOECISH 資通安全稽核管考平台`,
        kind: 'checklist-submitted',
        relatedCycleId: cycle.id,
        context: { submittedBy: opts.submittedByName },
      }),
    ),
  );
  return { recipientCount: recipients.length };
}

/** 委員完成檢核表審閱意見 → 通知最高管理員(中心)彙整、決定是否退回。 */
export async function notifyChecklistReviewDone(opts: {
  cycleId: string;
  auditorName: string;
  appBaseUrl: string;
}) {
  const cycle = await prisma.auditCycle.findUnique({
    where: { id: opts.cycleId },
    include: { organization: true },
  });
  if (!cycle) return { recipientCount: 0 };

  const recipients = await prisma.user.findMany({
    where: { role: 'SUPER_ADMIN', isActive: true },
  });
  if (recipients.length === 0) return { recipientCount: 0 };

  const link = `${opts.appBaseUrl}/cycles/${cycle.id}/review`;
  const yearROC = cycle.year - 1911;
  const orgName = cycle.organization.shortName ?? cycle.organization.name;

  await Promise.all(
    recipients.map((u) =>
      sendEmail({
        to: u.email,
        toName: u.name,
        subject: `[MOECISH] ${opts.auditorName} 已完成 ${orgName} ${yearROC} 年度檢核表審閱意見`,
        body:
          `${u.name} 您好,\n\n` +
          `${opts.auditorName} 委員已完成 ${cycle.organization.name} ${yearROC} 年度資通安全檢核表的審閱意見填寫。\n` +
          `請登入檢視各題委員意見,並決定是否退回機關補正:\n\n` +
          `${link}\n\n` +
          `— MOECISH 資通安全稽核管考平台`,
        kind: 'checklist-review-done',
        relatedCycleId: cycle.id,
        context: { auditorName: opts.auditorName },
      }),
    ),
  );
  return { recipientCount: recipients.length };
}

/** 委員按「確認填寫完畢」鎖定評分/發現 → 通知最高管理員(讓中心掌握哪些委員已定稿)。 */
export async function notifyAuditScoreLocked(opts: {
  cycleId: string;
  auditorName: string;
  appBaseUrl: string;
}) {
  const cycle = await prisma.auditCycle.findUnique({
    where: { id: opts.cycleId },
    include: { organization: true },
  });
  if (!cycle) return { recipientCount: 0 };

  const recipients = await prisma.user.findMany({
    where: { role: 'SUPER_ADMIN', isActive: true },
  });
  if (recipients.length === 0) return { recipientCount: 0 };

  const link = `${opts.appBaseUrl}/cycles/${cycle.id}/audit/report`;
  const yearROC = cycle.year - 1911;
  const orgName = cycle.organization.shortName ?? cycle.organization.name;

  await Promise.all(
    recipients.map((u) =>
      sendEmail({
        to: u.email,
        toName: u.name,
        subject: `[MOECISH] ${opts.auditorName} 已完成 ${orgName} ${yearROC} 年度實地稽核評分/發現填寫`,
        body:
          `${u.name} 您好,\n\n` +
          `${opts.auditorName} 委員已按「確認填寫完畢」,鎖定 ${cycle.organization.name} ${yearROC} 年度的實地稽核評分與稽核發現。\n` +
          `可於彙整報告檢視該委員的評分與發現:\n\n` +
          `${link}\n\n` +
          `— MOECISH 資通安全稽核管考平台`,
        kind: 'audit-score-lock',
        relatedCycleId: cycle.id,
        context: { auditorName: opts.auditorName },
      }),
    ),
  );
  return { recipientCount: recipients.length };
}

/** 委員解除「確認填寫完畢」鎖定、修改評分/發現 → 通知最高管理員有內容異動。 */
export async function notifyAuditScoreUnlocked(opts: {
  cycleId: string;
  auditorName: string;
  appBaseUrl: string;
}) {
  const cycle = await prisma.auditCycle.findUnique({
    where: { id: opts.cycleId },
    include: { organization: true },
  });
  if (!cycle) return { recipientCount: 0 };

  const recipients = await prisma.user.findMany({
    where: { role: 'SUPER_ADMIN', isActive: true },
  });
  if (recipients.length === 0) return { recipientCount: 0 };

  const link = `${opts.appBaseUrl}/cycles/${cycle.id}/audit/report`;
  const yearROC = cycle.year - 1911;
  const orgName = cycle.organization.shortName ?? cycle.organization.name;

  await Promise.all(
    recipients.map((u) =>
      sendEmail({
        to: u.email,
        toName: u.name,
        subject: `[MOECISH] ${opts.auditorName} 已解除鎖定並修改 ${orgName} ${yearROC} 年度實地稽核評分/發現`,
        body:
          `${u.name} 您好,\n\n` +
          `${opts.auditorName} 委員已將 ${cycle.organization.name} ${yearROC} 年度的實地稽核評分與發現「解除鎖定」以進行修改;\n` +
          `先前「確認填寫完畢」的內容可能已有異動,請留意並於需要時複核:\n\n` +
          `${link}\n\n` +
          `— MOECISH 資通安全稽核管考平台`,
        kind: 'audit-score-unlock',
        relatedCycleId: cycle.id,
        context: { auditorName: opts.auditorName },
      }),
    ),
  );
  return { recipientCount: recipients.length };
}

/** 檢核表被退回重填 → 通知機關管理員(帶退回原因)。 */
export async function notifyChecklistReopened(opts: {
  cycleId: string;
  reason: string;
  reopenedByName: string;
  appBaseUrl: string;
}) {
  const cycle = await prisma.auditCycle.findUnique({
    where: { id: opts.cycleId },
    include: { organization: true },
  });
  if (!cycle) return { recipientCount: 0 };

  const recipients = await prisma.user.findMany({
    where: { organizationId: cycle.organizationId, role: 'ORG_ADMIN', isActive: true },
  });
  if (recipients.length === 0) return { recipientCount: 0 };

  const link = `${opts.appBaseUrl}/cycles/${cycle.id}/checklist`;
  const yearROC = cycle.year - 1911;

  await Promise.all(
    recipients.map((u) =>
      sendEmail({
        to: u.email,
        toName: u.name,
        subject: `[MOECISH] ${yearROC} 年度檢核表填報被退回,請補正後重新送出`,
        body:
          `${u.name} 您好,\n\n` +
          `${cycle.organization.name} ${yearROC} 年度資通安全檢核表填報經 ${opts.reopenedByName} 退回重填。\n\n` +
          `退回原因:\n${opts.reason}\n\n` +
          `請依意見補正後重新送出:\n${link}\n\n` +
          `— MOECISH 資通安全稽核管考平台`,
        kind: 'checklist-reopened',
        relatedCycleId: cycle.id,
        context: { reason: opts.reason, reopenedBy: opts.reopenedByName },
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

/** 機關「確定繳交」稽核前資料 → 通知最高管理員(中心)開始審核。 */
export async function notifyPrepSubmitted(opts: {
  cycleId: string;
  submittedByName: string;
  appBaseUrl: string;
}) {
  const cycle = await prisma.auditCycle.findUnique({
    where: { id: opts.cycleId },
    include: { organization: true },
  });
  if (!cycle) return { recipientCount: 0 };

  const recipients = await prisma.user.findMany({
    where: { role: 'SUPER_ADMIN', isActive: true },
  });
  if (recipients.length === 0) return { recipientCount: 0 };

  const link = `${opts.appBaseUrl}/cycles/${cycle.id}/prep`;
  const yearROC = cycle.year - 1911;
  const orgName = cycle.organization.shortName ?? cycle.organization.name;

  await Promise.all(
    recipients.map((u) =>
      sendEmail({
        to: u.email,
        toName: u.name,
        subject: `[MOECISH] ${orgName} 已確定繳交 ${yearROC} 年度稽核前資料,請審核`,
        body:
          `${u.name} 您好,\n\n` +
          `${cycle.organization.name} 已由 ${opts.submittedByName} 完成 ${yearROC} 年度稽核前資料準備並「確定繳交」,內容已鎖定。\n` +
          `請登入系統逐項審核(確認齊備或退回補正):\n\n` +
          `${link}\n\n` +
          `— MOECISH 資通安全稽核管考平台`,
        kind: 'prep-submitted',
        relatedCycleId: cycle.id,
        context: { submittedBy: opts.submittedByName },
      }),
    ),
  );
  return { recipientCount: recipients.length };
}

/** 中心退回某項稽核前資料 → 通知機關管理員(帶退回說明與直達連結)。 */
export async function notifyPrepReturned(opts: {
  submissionId: string;
  reviewNote: string;
  appBaseUrl: string;
}) {
  const sub = await prisma.prepSubmission.findUnique({
    where: { id: opts.submissionId },
    include: { requirement: { include: { cycle: { include: { organization: true } } } } },
  });
  if (!sub) return { recipientCount: 0 };
  const cycle = sub.requirement.cycle;

  const recipients = await prisma.user.findMany({
    where: { organizationId: cycle.organizationId, role: 'ORG_ADMIN', isActive: true },
  });
  if (recipients.length === 0) return { recipientCount: 0 };

  const link = `${opts.appBaseUrl}/cycles/${cycle.id}/prep`;
  const yearROC = cycle.year - 1911;

  await Promise.all(
    recipients.map((u) =>
      sendEmail({
        to: u.email,
        toName: u.name,
        subject: `[MOECISH] ${yearROC} 年度稽核前資料「${sub.requirement.title}」被退回補正`,
        body:
          `${u.name} 您好,\n\n` +
          `${cycle.organization.name} ${yearROC} 年度稽核前資料之「${sub.requirement.title}」經中心審核退回補正。\n\n` +
          `退回說明:\n${opts.reviewNote}\n\n` +
          `請依說明補正後重新「確定繳交」:\n${link}\n\n` +
          `— MOECISH 資通安全稽核管考平台`,
        kind: 'prep-returned',
        relatedCycleId: cycle.id,
        context: { submissionId: sub.id, title: sub.requirement.title },
      }),
    ),
  );
  return { recipientCount: recipients.length };
}

/** 週期狀態推進(forward 轉換)時通知機關管理員;依新狀態給對應訊息與連結。 */
export async function notifyCycleStatusChange(opts: {
  cycleId: string;
  status: string;
  appBaseUrl: string;
}) {
  const cycle = await prisma.auditCycle.findUnique({
    where: { id: opts.cycleId },
    include: { organization: true },
  });
  if (!cycle) return { recipientCount: 0 };

  const recipients = await prisma.user.findMany({
    where: { organizationId: cycle.organizationId, role: 'ORG_ADMIN', isActive: true },
  });
  if (recipients.length === 0) return { recipientCount: 0 };

  const MAP: Record<string, { label: string; path: string; hint: string }> = {
    PREPARATION: { label: '資料準備', path: '/prep', hint: '請依清單上傳稽核前所需文件。' },
    READY: { label: '資料齊備、待實地稽核', path: '', hint: '資料已確認齊備,後續將安排實地稽核時程。' },
    ONSITE: { label: '實地稽核中', path: '', hint: '已進入實地稽核階段。' },
    REPORT_ISSUED: { label: '稽核報告已產出', path: '', hint: '稽核報告已產出,後續將開放缺失矯正。' },
    REMEDIATION: { label: '缺失矯正', path: '/deficiencies', hint: '缺失已開放,請填報矯正措施與佐證。' },
    CLOSED: { label: '已結案', path: '', hint: '本年度稽核已結案,感謝配合。' },
  };
  const m = MAP[opts.status];
  if (!m) return { recipientCount: 0 };

  const link = `${opts.appBaseUrl}/cycles/${cycle.id}${m.path}`;
  const yearROC = cycle.year - 1911;
  await Promise.all(
    recipients.map((u) =>
      sendEmail({
        to: u.email,
        toName: u.name,
        subject: `[MOECISH] ${yearROC} 年度稽核狀態更新:${m.label}`,
        body:
          `${u.name} 您好,\n\n` +
          `${cycle.organization.name} 的 ${yearROC} 年度資通安全稽核狀態已更新為「${m.label}」。\n` +
          `${m.hint}\n\n` +
          `請登入系統查看:\n${link}\n\n` +
          `— MOECISH 資通安全稽核管考平台`,
        kind: 'cycle-notify',
        relatedCycleId: cycle.id,
        dedupeKey: `status-${opts.status}`,
        context: { status: opts.status },
      }),
    ),
  );
  return { recipientCount: recipients.length };
}
