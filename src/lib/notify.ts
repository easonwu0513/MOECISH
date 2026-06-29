import { prisma } from './db';
import { sendEmail } from './email';
import { fmtROC } from './date';
import { cycleTransitionNotify } from './notify-policy';
import type { CycleStatus } from './types';

/**
 * 週期狀態 → 通知機關的訊息內容(僅 org 通知政策為 true 的狀態才有條目)。
 * 是否要寄(對象)由 notify-policy 的 cycleTransitionNotify 決定;此處只放文案。
 * test:notify 會驗「有訊息的狀態」與「政策 org=true 的狀態」一致,防止漂移。
 */
export const CYCLE_STATUS_MESSAGES: Partial<Record<CycleStatus, { label: string; path: string; hint: string }>> = {
  PREPARATION: { label: '資料準備', path: '/prep', hint: '請依清單上傳稽核前所需文件。' },
  READY: { label: '資料齊備、待實地稽核', path: '', hint: '資料已確認齊備，後續將安排實地稽核時程。' },
  REPORT_ISSUED: { label: '稽核報告已產出', path: '', hint: '稽核報告已產出，後續將開放缺失矯正。' },
  REMEDIATION: { label: '缺失矯正', path: '/deficiencies', hint: '缺失已開放，請填報矯正措施與佐證。' },
  CLOSED: { label: '已結案', path: '', hint: '本年度稽核已結案，感謝配合。' },
};

/**
 * 中心建立週期、設定好日期後,正式通知機關:貴機關今年度將進行資通安全稽核(附已確定之重要時程)。
 * 與 notifyCycleOrgAdmins(缺失已發布)不同——此為稽核「啟動前」之作業通知,內容不得提及缺失/矯正。
 * 由週期頁「通知機關」按鈕觸發(中心確認時程後再發),不在建立週期當下自動發送。
 */
export async function notifyCycleOpened(opts: { cycleId: string; appBaseUrl: string }) {
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
  const scheduleLines = [
    cycle.techCheckDate && `・技術檢測日:${fmtROC(cycle.techCheckDate)}`,
    cycle.onsiteDate && `・實地稽核日:${fmtROC(cycle.onsiteDate)}`,
    cycle.prepDueTech && `・技術檢測資料繳交截止:${fmtROC(cycle.prepDueTech)}`,
    cycle.prepDueDate && `・實地稽核資料繳交截止:${fmtROC(cycle.prepDueDate)}`,
    cycle.dueDate && `・矯正填報截止:${fmtROC(cycle.dueDate)}`,
  ].filter(Boolean) as string[];
  const scheduleBlock = scheduleLines.length
    ? `重要時程如下:\n${scheduleLines.join('\n')}\n\n`
    : '相關時程確定後將另行通知。\n\n';

  const results = await Promise.all(
    recipients.map((u) =>
      sendEmail({
        to: u.email,
        toName: u.name,
        subject: `[MOECISH] 貴機關 ${yearROC} 年度資通安全稽核作業通知`,
        body:
          `${u.name} 您好,\n\n` +
          `${cycle.organization.name} 之 ${yearROC} 年度資通安全稽核作業已於平台建立,貴機關今年度將接受資通安全稽核。\n\n` +
          scheduleBlock +
          `待中心開放「資料準備」後,請登入平台依清單填寫資通安全檢核表並上傳應備文件:\n${link}\n\n` +
          `— MOECISH 資通安全稽核管考平台`,
        kind: 'cycle-notify',
        relatedCycleId: cycle.id,
        context: { phase: 'cycle-opened' },
      }),
    ),
  );

  return { cycleId: cycle.id, recipientCount: recipients.length, emailIds: results.map((r) => r.id) };
}

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
  const due = cycle.dueDate ? new Date(cycle.dueDate).toLocaleDateString('zh-TW') : '（實地稽核後另訂）';

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
        subject: `[MOECISH] ${orgName} 已送審矯正措施（第 ${def.itemNo} 項），敬請審查`,
        body:
          `${u.name} 委員您好，\n\n` +
          `${cycle.organization.name} 於 ${yearROC} 年度稽核已送審 1 項矯正措施，\n` +
          `請登入系統檢視填報內容與佐證並進行審查：\n\n` +
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
        subject: `[MOECISH] 矯正措施退回補正（第 ${def.itemNo} 項），敬請依意見重新提交`,
        body:
          `${u.name} 您好，\n\n` +
          `${cycle.organization.name} ${yearROC} 年度稽核之第 ${def.itemNo} 項矯正措施經委員審查退回（第 ${opts.round} 輪）。\n\n` +
          `退回理由：\n${opts.comment}\n\n` +
          `請依意見補正後重新送審：\n${link}\n\n` +
          `— MOECISH 資通安全稽核管考平台`,
        kind: 'action-returned',
        relatedCycleId: cycle.id,
        context: { deficiencyId: def.id, itemNo: def.itemNo, round: opts.round },
      }),
    ),
  );
  return { recipientCount: recipients.length };
}

/** 機關完成檢核表填報送出 → 通知最高管理員(中心)審核。
 *  委員於「資料齊備」後才看得到機關檢核表,故送出時不通知委員;
 *  改在中心推進至資料齊備時,由提示觸發 notifyCommitteeReview 通知委員審閱。 */
export async function notifyChecklistSubmitted(opts: {
  cycleId: string;
  submittedByName: string;
  appBaseUrl: string;
}) {
  const cycle = await prisma.auditCycle.findUnique({
    where: { id: opts.cycleId },
    include: { organization: true },
  });
  if (!cycle) return { recipientCount: 0 };

  // 機關送出檢核表 → 通知最高管理員(中心)審核;委員於「資料齊備」後才看得到,屆時由中心另發 notifyCommitteeReview。
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
        subject: `[MOECISH] ${orgName} 已完成 ${yearROC} 年度檢核表填報，請審核`,
        body:
          `${u.name} 您好，\n\n` +
          `${cycle.organization.name} 已於本日由 ${opts.submittedByName} 完成 ${yearROC} 年度資通安全檢核表填報並送出，內容已鎖定。\n` +
          `請登入系統審閱填報內容;待稽核前資料一併確認齊備後，推進週期至「資料齊備」並通知委員審閱：\n\n` +
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

/** 中心於「資料齊備」後,主動寄信通知受指派委員開始審閱檢核表(由週期推進至資料齊備時的提示觸發)。 */
export async function notifyCommitteeReview(opts: { cycleId: string; appBaseUrl: string }) {
  const cycle = await prisma.auditCycle.findUnique({
    where: { id: opts.cycleId },
    include: { organization: true, assignments: true },
  });
  if (!cycle) return { recipientCount: 0 };

  const recipients = await prisma.user.findMany({
    where: { id: { in: cycle.assignments.map((a) => a.auditorId) }, isActive: true },
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
        subject: `[MOECISH] ${orgName} ${yearROC} 年度資料已齊備，請開始審閱檢核表`,
        body:
          `${u.name} 委員您好，\n\n` +
          `${cycle.organization.name} 的 ${yearROC} 年度資通安全稽核資料已確認齊備，現已開放委員檢視。\n` +
          `請登入系統逐題檢視機關自評檢核表並留審閱註記，並準備後續實地稽核：\n\n` +
          `${link}\n\n` +
          `— MOECISH 資通安全稽核管考平台`,
        kind: 'committee-review',
        relatedCycleId: cycle.id,
        // 同一週期對同一委員 24h 內只寄一次(轉換重試/回退再進入不重複轟炸;不同週期各自獨立)
        dedupeKey: `committee-review-${cycle.id}`,
        context: {},
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
          `${u.name} 您好，\n\n` +
          `${opts.auditorName} 委員已完成 ${cycle.organization.name} ${yearROC} 年度資通安全檢核表的審閱意見填寫。\n` +
          `請登入檢視各題委員意見，並決定是否退回機關補正：\n\n` +
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
        subject: `[MOECISH] ${opts.auditorName} 已完成 ${orgName} ${yearROC} 年度實地稽核評分與發現填寫`,
        body:
          `${u.name} 您好，\n\n` +
          `${opts.auditorName} 委員已按「確認填寫完畢」，鎖定 ${cycle.organization.name} ${yearROC} 年度的實地稽核評分與稽核發現。\n` +
          `可於彙整報告檢視該委員的評分與發現：\n\n` +
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
        subject: `[MOECISH] ${opts.auditorName} 已解除鎖定並修改 ${orgName} ${yearROC} 年度實地稽核評分與發現`,
        body:
          `${u.name} 您好，\n\n` +
          `${opts.auditorName} 委員已將 ${cycle.organization.name} ${yearROC} 年度的實地稽核評分與發現「解除鎖定」以進行修改；\n` +
          `先前「確認填寫完畢」的內容可能已有異動，請留意並於需要時複核：\n\n` +
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

/** 最高管理員「退件」:通知該委員其評分與發現已退回、已解除鎖定,請重新編輯後再次確認。 */
export async function notifyAuditScoreReturned(opts: {
  cycleId: string;
  auditorId: string;
  reason?: string;
  appBaseUrl: string;
}) {
  const cycle = await prisma.auditCycle.findUnique({
    where: { id: opts.cycleId },
    include: { organization: true },
  });
  if (!cycle) return { recipientCount: 0 };

  const auditor = await prisma.user.findFirst({
    where: { id: opts.auditorId, isActive: true },
  });
  if (!auditor) return { recipientCount: 0 };

  const link = `${opts.appBaseUrl}/cycles/${cycle.id}/audit`;
  const yearROC = cycle.year - 1911;
  const orgName = cycle.organization.shortName ?? cycle.organization.name;

  await sendEmail({
    to: auditor.email,
    toName: auditor.name,
    subject: `[MOECISH] 您於 ${orgName} ${yearROC} 年度的實地稽核評分已退回,請重新確認`,
    body:
      `${auditor.name} 委員您好,\n\n` +
      `最高管理員已將您於 ${cycle.organization.name} ${yearROC} 年度的實地稽核評分與稽核發現退回,已解除鎖定;\n` +
      `請重新編輯後,再次按「確認填寫完畢」。\n` +
      (opts.reason ? `\n退回原因:${opts.reason}\n` : '') +
      `\n請至實地稽核評分與發現頁面處理:\n\n` +
      `${link}\n\n` +
      `— MOECISH 資通安全稽核管考平台`,
    kind: 'audit-score-return',
    relatedCycleId: cycle.id,
    context: { auditorName: auditor.name },
  });
  return { recipientCount: 1 };
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
        subject: `[MOECISH] ${yearROC} 年度檢核表填報被退回，請補正後重新送出`,
        body:
          `${u.name} 您好，\n\n` +
          `${cycle.organization.name} ${yearROC} 年度資通安全檢核表填報，經 ${opts.reopenedByName} 確認後退回重填。\n\n` +
          `退回原因：\n${opts.reason}\n\n` +
          `請依上述退回原因補正後重新送出：\n${link}\n\n` +
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
        subject: `[MOECISH] ${yearROC} 年度矯正措施全數通過，請列印改善報告用印回傳`,
        body:
          `${u.name} 您好，\n\n` +
          `${cycle.organization.name} ${yearROC} 年度資通安全稽核之矯正措施已全數審查通過。\n` +
          `請至系統列印「資通安全稽核改善暨執行情形報告」，完成機關用印後將掃描檔上傳，以利結案：\n\n` +
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
        subject: `[MOECISH] ${orgName} 已確定繳交 ${yearROC} 年度稽核前資料，請審核`,
        body:
          `${u.name} 您好，\n\n` +
          `${cycle.organization.name} 已由 ${opts.submittedByName} 完成 ${yearROC} 年度稽核前資料準備並「確定繳交」，內容已鎖定。\n` +
          `請登入系統逐項審核（確認齊備或退回補正）：\n\n` +
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
          `${u.name} 您好，\n\n` +
          `${cycle.organization.name} ${yearROC} 年度稽核前資料之「${sub.requirement.title}」經中心審核退回補正。\n\n` +
          `退回說明：\n${opts.reviewNote}\n\n` +
          `請依說明補正後重新「確定繳交」：\n${link}\n\n` +
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

  // 是否通知機關由 notify-policy SoT 決定(ONSITE 等無機關動作的階段 → 不寄;見 test:notify)
  if (!cycleTransitionNotify(opts.status as CycleStatus).org) return { recipientCount: 0 };
  const m = CYCLE_STATUS_MESSAGES[opts.status as CycleStatus];
  if (!m) return { recipientCount: 0 };

  const recipients = await prisma.user.findMany({
    where: { organizationId: cycle.organizationId, role: 'ORG_ADMIN', isActive: true },
  });
  if (recipients.length === 0) return { recipientCount: 0 };

  const link = `${opts.appBaseUrl}/cycles/${cycle.id}${m.path}`;
  const yearROC = cycle.year - 1911;
  await Promise.all(
    recipients.map((u) =>
      sendEmail({
        to: u.email,
        toName: u.name,
        subject: `[MOECISH] ${yearROC} 年度稽核狀態更新：${m.label}`,
        body:
          `${u.name} 您好，\n\n` +
          `${cycle.organization.name} 的 ${yearROC} 年度資通安全稽核狀態已更新為「${m.label}」。\n` +
          `${m.hint}\n\n` +
          `請登入系統查看：\n${link}\n\n` +
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
