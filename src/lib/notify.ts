import { Prisma } from '@prisma/client';
import { prisma } from './db';
import { sendEmail } from './email';
import { fmtROC } from './date';
import { cycleTransitionNotify } from './notify-policy';
import {
  DEFICIENCY_ASPECT_LABELS,
  DEFICIENCY_TYPE_LABELS,
  TRACKED_REVIEW_STATUS_LABELS,
  type CycleStatus,
  type DeficiencyAspect,
  type DeficiencyType,
  type TrackedReviewStatus,
} from './types';

/**
 * 機關管理員(ORG_ADMIN)收件人 where(批51):納「多重身分授權」。
 * 除「現用身分即為該機關 ORG_ADMIN」者,亦含以 UserRole 授權持該機關 ORG_ADMIN(endedAt=null)者——
 * 多重身分帳號切換現用身分後(User.organizationId 暫離本機關)仍應收到本機關通知,否則漏收(批31 多重身分之副作用)。
 * 用於「收件人綁單一週期機關、orgName 取自 cycle」的自動通知;各呼叫端保留自身 select。
 * (中心手動群發 admin/emails/send 以收件人自身 org 代入 {{orgName}},刻意不套此 helper——見該檔。)
 */
export function orgAdminWhere(organizationId: string): Prisma.UserWhereInput {
  return {
    isActive: true,
    OR: [
      { organizationId, role: 'ORG_ADMIN' },
      { roleGrants: { some: { organizationId, role: 'ORG_ADMIN', endedAt: null } } },
    ],
  };
}

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
    where: orgAdminWhere(cycle.organizationId),
  });
  if (recipients.length === 0) return { recipientCount: 0 };

  const link = `${opts.appBaseUrl}/cycles/${cycle.id}`;
  const yearROC = cycle.year - 1911;
  const scheduleLines = [
    cycle.techCheckDate && `・技術檢測日：${fmtROC(cycle.techCheckDate)}`,
    cycle.onsiteDate && `・實地稽核日：${fmtROC(cycle.onsiteDate)}`,
    cycle.prepDueTech && `・技術檢測資料繳交截止：${fmtROC(cycle.prepDueTech)}`,
    cycle.prepDueDate && `・實地稽核資料繳交截止：${fmtROC(cycle.prepDueDate)}`,
    cycle.dueDate && `・矯正填報截止：${fmtROC(cycle.dueDate)}`,
  ].filter(Boolean) as string[];
  const scheduleBlock = scheduleLines.length
    ? `重要時程如下：\n${scheduleLines.join('\n')}\n\n`
    : '相關時程確定後將另行通知。\n\n';

  const results = await Promise.all(
    recipients.map((u) =>
      sendEmail({
        to: u.email,
        toName: u.name,
        subject: `[MOECISH] 貴機關 ${yearROC} 年度資通安全稽核作業通知`,
        body:
          `${u.name} 您好，\n\n` +
          `${cycle.organization.name} 之 ${yearROC} 年度資通安全稽核作業已於平台建立，貴機關今年度將接受資通安全稽核。\n\n` +
          scheduleBlock +
          `待中心開放「資料準備」後，請登入平台依清單填寫資通安全檢核表並上傳應備文件：\n${link}\n\n` +
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
    where: orgAdminWhere(cycle.organizationId),
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

  let auditors = await prisma.user.findMany({
    where: {
      id: { in: cycle.assignments.map((a) => a.auditorId) },
      isActive: true,
    },
  });
  // 個別送審但本週期尚無「在職且受指派」委員(未指派/委員已停用)→ 通知中心(SUPER_ADMIN),
  // 否則此送審件無人知悉待審(鏡射 notifyAuditorsOnRoundSubmit 的 uncovered→中心)。
  let toCenter = false;
  if (auditors.length === 0) {
    auditors = await prisma.user.findMany({ where: { role: 'SUPER_ADMIN', isActive: true } });
    toCenter = true;
  }
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
          `${u.name}${toCenter ? '' : ' 委員'}您好，\n\n` +
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

/**
 * 一輪矯正措施「批次送審」後,對每位委員寄「單一封」彙整通知(批50):
 * 原 notifyAuditorsOnSubmit 每送一件就對全體委員各寄一封 → N 件會讓每位委員收到 N 封信;
 * 改為每位委員一封,只列「本輪送審且屬其審閱(或尚未指派)」的缺失,杜絕信件轟炸。
 */
export async function notifyAuditorsOnRoundSubmit(opts: {
  cycleId: string;
  deficiencyIds: string[];
  appBaseUrl: string;
}) {
  if (opts.deficiencyIds.length === 0) return { recipientCount: 0 };
  const cycle = await prisma.auditCycle.findUnique({
    where: { id: opts.cycleId },
    include: { organization: true, assignments: true },
  });
  if (!cycle) return { recipientCount: 0 };

  const [defs, auditors, admins] = await Promise.all([
    prisma.deficiency.findMany({
      where: { id: { in: opts.deficiencyIds } },
      select: { id: true, itemNo: true, aspect: true, type: true, reviewerAuditorId: true },
      orderBy: [{ aspect: 'asc' }, { type: 'asc' }, { itemNo: 'asc' }],
    }),
    prisma.user.findMany({
      where: { id: { in: cycle.assignments.map((a) => a.auditorId) }, isActive: true },
    }),
    prisma.user.findMany({ where: { role: 'SUPER_ADMIN', isActive: true } }),
  ]);

  const link = `${opts.appBaseUrl}/cycles/${cycle.id}/deficiencies?status=submitted`;
  const yearROC = cycle.year - 1911;
  const orgName = cycle.organization.shortName ?? cycle.organization.name;

  type Def = (typeof defs)[number];
  const sendReviewMail = (u: { email: string; name: string }, list: Def[], salutation: string) => {
    const listText = list
      .map(
        (d) =>
          `・${DEFICIENCY_ASPECT_LABELS[d.aspect as DeficiencyAspect]}－${DEFICIENCY_TYPE_LABELS[d.type as DeficiencyType]} 第 ${d.itemNo} 項`,
      )
      .join('\n');
    return sendEmail({
      to: u.email,
      toName: u.name,
      subject: `[MOECISH] ${orgName} 已送審 ${list.length} 項矯正措施，敬請審查`,
      body:
        `${salutation}\n\n` +
        `${cycle.organization.name} 於 ${yearROC} 年度稽核本輪送審以下 ${list.length} 項矯正措施，\n` +
        `請登入系統檢視填報內容與佐證並進行審查：\n\n` +
        `${listText}\n\n` +
        `${link}\n\n` +
        `— MOECISH 資通安全稽核管考平台`,
      kind: 'review-request',
      relatedCycleId: cycle.id,
      context: { deficiencyIds: list.map((d) => d.id) },
    });
  };

  let recipientCount = 0;
  const covered = new Set<string>();
  // 指派審閱委員:每位只收「指派給他審閱」的本輪缺失(一封彙整信)
  await Promise.all(
    auditors.map(async (u) => {
      const mine = defs.filter((d) => d.reviewerAuditorId === u.id);
      if (mine.length === 0) return;
      mine.forEach((d) => covered.add(d.id));
      await sendReviewMail(u, mine, `${u.name} 委員您好，`);
      recipientCount++;
    }),
  );
  // 無「在職且被指派」委員涵蓋的缺失(未指派審閱委員,或指派給已停用委員)→ 通知中心:
  // 未指派者僅中心可審(委員清單/審查 API 皆 reviewer-scoped),否則會漏通知(批50 專審 P2)。
  const uncovered = defs.filter((d) => !covered.has(d.id));
  if (uncovered.length > 0) {
    await Promise.all(
      admins.map(async (u) => {
        await sendReviewMail(u, uncovered, `${u.name} 您好，`);
        recipientCount++;
      }),
    );
  }
  return { recipientCount };
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
    where: orgAdminWhere(cycle.organizationId),
  });
  if (recipients.length === 0) return { recipientCount: 0 };

  const link = `${opts.appBaseUrl}/cycles/${cycle.id}/deficiencies/${def.id}`;
  const yearROC = cycle.year - 1911;

  await Promise.all(
    recipients.map((u) =>
      sendEmail({
        to: u.email,
        toName: u.name,
        subject: `[MOECISH] 矯正措施退回補正（第 ${def.itemNo} 項），敬請依意見重新送出`,
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
          `請登入系統審閱填報內容；待稽核前資料一併確認齊備後，推進週期至「資料齊備」並通知委員審閱：\n\n` +
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

/** 機關「確認繳交」用印改善報告掃描檔 → 通知最高管理員(中心)確認(結案前置)。email + 站內。 */
export async function notifyCycleSignedReportSubmitted(opts: {
  cycleId: string;
  submittedByName: string;
  fileName: string;
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

  const link = `${opts.appBaseUrl}/cycles/${cycle.id}#signed-report`;
  const yearROC = cycle.year - 1911;
  const orgName = cycle.organization.shortName ?? cycle.organization.name;

  await Promise.all(
    recipients.map((u) =>
      sendEmail({
        to: u.email,
        toName: u.name,
        subject: `[MOECISH] ${orgName} 已繳交 ${yearROC} 年度用印改善報告掃描檔，請確認`,
        body:
          `${u.name} 您好，\n\n` +
          `${cycle.organization.name} 已於本日由 ${opts.submittedByName} 確認繳交 ${yearROC} 年度用印改善報告掃描檔（${opts.fileName}），檔案已鎖定。\n` +
          `請登入系統確認掃描檔；確認後即可結案：\n\n` +
          `${link}\n\n` +
          `— MOECISH 資通安全稽核管考平台`,
        kind: 'signed-report-submitted',
        relatedCycleId: cycle.id,
        notificationLink: `/cycles/${cycle.id}#signed-report`,
        context: { submittedBy: opts.submittedByName, fileName: opts.fileName },
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

/**
 * 觀察員受配對為某週期觀察員(批66 M2)→ 通知該觀察員(email + 站內)。
 * 由 observers POST 配對成功後呼叫(寄信失敗不影響配對,呼叫端 try/catch)。
 * 僅通知被配對的該名觀察員本人(CycleObserver.observerId 直指 user,不涉他人);
 * 同一週期對同一觀察員 24h 去重(改指導委員等重複 upsert 不重複轟炸)。
 */
export async function notifyObserverOnPaired(opts: {
  cycleId: string;
  observerId: string;
  mentorId: string;
  appBaseUrl: string;
}) {
  const [cycle, observer, mentor] = await Promise.all([
    prisma.auditCycle.findUnique({ where: { id: opts.cycleId }, include: { organization: true } }),
    prisma.user.findUnique({
      where: { id: opts.observerId },
      select: { id: true, name: true, email: true, isActive: true },
    }),
    prisma.user.findUnique({ where: { id: opts.mentorId }, select: { name: true } }),
  ]);
  if (!cycle || !observer || !observer.isActive) return { recipientCount: 0 };

  const link = `${opts.appBaseUrl}/cycles/${cycle.id}`;
  const yearROC = cycle.year - 1911;
  const orgName = cycle.organization.shortName ?? cycle.organization.name;
  const mentorName = mentor?.name ?? '（待中心指派）';

  await sendEmail({
    to: observer.email,
    toName: observer.name,
    subject: `[MOECISH] 您已受配對為 ${orgName} ${yearROC} 年度稽核之觀察員`,
    body:
      `${observer.name} 您好，\n\n` +
      `您已受配對為 ${cycle.organization.name} ${yearROC} 年度資通安全稽核之觀察員（指導委員：${mentorName}）。\n` +
      `待資料齊備後，您可於觀察員審閱時段內檢視機關資料、熟悉稽核背景，並於練習工作台進行評分練習：\n\n` +
      `${link}\n\n` +
      `— MOECISH 資通安全稽核管考平台`,
    kind: 'observer-paired',
    relatedCycleId: cycle.id,
    // 同一週期對同一觀察員 24h 內只寄一次(改指導委員等重複 upsert 不重複轟炸)
    dedupeKey: `observer-paired-${cycle.id}-${observer.id}`,
    context: { observerId: observer.id, mentorId: opts.mentorId },
  });
  return { recipientCount: 1 };
}

/**
 * 資料齊備(READY)或事後設定/變更觀察員審閱窗口(批66 M2)→ 通知本週期「已配對」觀察員
 * 可於觀察員審閱時段檢視機關資料熟悉背景(email + 站內)。比照委員 notifyCommitteeReview。
 * 政策=僅通知本週期配對觀察員(CycleObserver.observerId 直指 user),絕不外洩他週期/他機關。
 * dedupeKey 含窗口值:同一(週期,窗口)只寄一次(轉換重試/重複存檔不轟炸);窗口真正變更則以新鍵再通知一次。
 */
export async function notifyObserversOnReviewOpen(opts: { cycleId: string; appBaseUrl: string }) {
  const cycle = await prisma.auditCycle.findUnique({
    where: { id: opts.cycleId },
    include: { organization: true },
  });
  if (!cycle) return { recipientCount: 0 };

  const paired = await prisma.cycleObserver.findMany({
    where: { cycleId: opts.cycleId },
    include: { observer: { select: { id: true, name: true, email: true, isActive: true } } },
  });
  const recipients = paired.filter((p) => p.observer.isActive);
  if (recipients.length === 0) return { recipientCount: 0 };

  const link = `${opts.appBaseUrl}/cycles/${cycle.id}`;
  const yearROC = cycle.year - 1911;
  const orgName = cycle.organization.shortName ?? cycle.organization.name;
  const windowText =
    cycle.observerWindowStart && cycle.observerWindowEnd
      ? `${fmtROC(cycle.observerWindowStart)}－${fmtROC(cycle.observerWindowEnd)}`
      : '待中心設定';
  // 窗口值入去重鍵:窗口未變 → 24h 內不重寄;窗口變更 → 新鍵再通知一次(既不漏真正變更,也不重複轟炸)
  const wKey = `${cycle.observerWindowStart?.toISOString() ?? 'none'}_${cycle.observerWindowEnd?.toISOString() ?? 'none'}`;

  await Promise.all(
    recipients.map((p) =>
      sendEmail({
        to: p.observer.email,
        toName: p.observer.name,
        subject: `[MOECISH] ${orgName} ${yearROC} 年度資料已齊備，請於觀察員審閱時段檢視`,
        body:
          `${p.observer.name} 您好，\n\n` +
          `${cycle.organization.name} 的 ${yearROC} 年度資通安全稽核資料已確認齊備。\n` +
          `請於觀察員審閱時段內檢視機關資料、熟悉稽核背景（審閱時段：${windowText}）：\n\n` +
          `${link}\n\n` +
          `— MOECISH 資通安全稽核管考平台`,
        kind: 'observer-review-open',
        relatedCycleId: cycle.id,
        dedupeKey: `observer-review-open-${cycle.id}-${wKey}`,
        context: { observerId: p.observer.id },
      }),
    ),
  );
  return { recipientCount: recipients.length };
}

/**
 * 委員求援:週期已進入可審閱階段,但中心尚未設定「委員審閱時段」(reviewWindowStart/End 為 null),
 * 委員因而全被鎖在門外且無自救 → 一鍵通知最高管理員(中心)盡快設定。email + 站內鈴鐺,24h 去重。
 */
export async function notifyReviewWindowRequested(opts: {
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

  const link = `${opts.appBaseUrl}/cycles/${cycle.id}/prep`;
  const yearROC = cycle.year - 1911;
  const orgName = cycle.organization.shortName ?? cycle.organization.name;

  await Promise.all(
    recipients.map((u) =>
      sendEmail({
        to: u.email,
        toName: u.name,
        subject: `[MOECISH] 委員待審：請設定 ${orgName} ${yearROC} 年度委員審閱時段`,
        body:
          `${u.name} 您好，\n\n` +
          `${opts.auditorName} 委員已可審閱 ${cycle.organization.name} ${yearROC} 年度資料，但本週期尚未設定「委員審閱時段」，委員目前無法檢視。\n` +
          `請至資料準備頁的「委員審閱時段」設定起訖後，委員即可開始審閱：\n\n` +
          `${link}\n\n` +
          `— MOECISH 資通安全稽核管考平台`,
        kind: 'review-window-request',
        relatedCycleId: cycle.id,
        notificationLink: `/cycles/${cycle.id}/prep`,
        // 同一週期 24h 內只提醒一次(避免多位委員/重複點擊轟炸中心)
        dedupeKey: `review-window-request-${cycle.id}`,
        context: { auditorName: opts.auditorName },
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

/** 最高管理員「退件」:以站內通知(不寄 email;退件於實地稽核現場口頭告知)告知該委員其評分與發現已退回、已解除鎖定,請重新編輯後再次確認。 */
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

  const yearROC = cycle.year - 1911;
  const orgName = cycle.organization.shortName ?? cycle.organization.name;

  // 退件於實地稽核現場即口頭告知委員,故「不寄 email」(避免委員信箱信件過多);
  // 僅建立站內通知(鈴鐺)供委員登入系統時看到,點擊導向實地稽核評分頁重新編輯。
  await prisma.notification.create({
    data: {
      userId: auditor.id,
      kind: 'audit-score-return',
      title: `您於 ${orgName} ${yearROC} 年度的實地稽核評分已退回，請重新確認`,
      body:
        '最高管理員已將您的實地稽核評分與稽核發現退回，已解除鎖定，請重新編輯後再次按「確認填寫完畢」。' +
        (opts.reason ? ` 退回原因：${opts.reason}` : ''),
      link: `/cycles/${cycle.id}/audit`,
    },
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
    where: orgAdminWhere(cycle.organizationId),
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
    where: orgAdminWhere(cycle.organizationId),
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
    where: orgAdminWhere(cycle.organizationId),
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

/**
 * 中心「一鍵寄追蹤信」:對落後(逾期/停滯)週期之機關管理員寄出進度追蹤提醒,並以 EmailLog(獨立 kind=track-remind,
 * relatedCycleId 綁定)構成該週期的「催辦軌跡」(不與一般 tracking / 自動催繳排程混淆)。提醒內容依週期階段給對應待辦焦點與直達連結。
 * 同一週期 24h 內對同一收件人只寄一次(dedupeKey),避免重複點擊轟炸;此為中心主動動作,非狀態轉換,故不受 notify-policy 約束。
 */
export async function notifyCycleTrackReminder(opts: {
  cycleId: string;
  triggeredById: string;
  appBaseUrl: string;
}) {
  const cycle = await prisma.auditCycle.findUnique({
    where: { id: opts.cycleId },
    include: { organization: true, deficiencies: { include: { action: { select: { status: true } } } } },
  });
  if (!cycle) return { recipientCount: 0, sentCount: 0, skippedCount: 0, remindCount: 0 };

  const recipients = await prisma.user.findMany({
    where: orgAdminWhere(cycle.organizationId),
  });

  const yearROC = cycle.year - 1911;
  // overdue 與 admin/cycles 落後列同義:REMEDIATION 且尚未全數通過且已過矯正截止(對齊避免對已完成週期誤稱「已逾期」)
  const total = cycle.deficiencies.length;
  const allPassed = total > 0 && cycle.deficiencies.every((d) => (d.action?.status ?? 'PENDING') === 'PASSED');
  const overdue = cycle.status === 'REMEDIATION' && !allPassed && !!cycle.dueDate && new Date(cycle.dueDate) < new Date();
  // 依階段給待辦焦點與直達連結;不誇稱未查詢的細目,只點出該階段機關應辦事項。
  let focus: { hint: string; path: string };
  switch (cycle.status) {
    case 'PREPARATION':
      focus = { hint: '請儘速完成稽核前應備文件上傳與資通安全檢核表填報。', path: '/prep' };
      break;
    case 'REMEDIATION':
      // 全數通過後,機關待辦已非「填報矯正措施」而是「列印改善報告→用印→上傳回傳」;
      // 催辦文案與直達連結須隨情境切換(否則催的是已完成的填報,語境錯位)。
      focus = allPassed
        ? {
            hint: '缺失矯正措施均已審查通過，請儘速列印改善報告、完成用印後上傳回傳中心以利結案。',
            path: '#signed-report',
          }
        : {
            hint: overdue
              ? `缺失矯正措施填報已逾期（截止 ${fmtROC(cycle.dueDate)}），請儘速完成矯正措施填報與佐證上傳。`
              : '請完成缺失矯正措施填報與佐證上傳。',
            path: '/deficiencies',
          };
      break;
    case 'REPORT_ISSUED':
      focus = { hint: '稽核報告已產出，後續缺失矯正開放後請儘速辦理。', path: '' };
      break;
    default:
      focus = { hint: '貴機關本年度稽核作業仍有待辦事項，請登入平台查看後續進度。', path: '' };
  }

  const link = `${opts.appBaseUrl}/cycles/${cycle.id}${focus.path}`;
  const results = await Promise.all(
    recipients.map((u) =>
      sendEmail({
        to: u.email,
        toName: u.name,
        subject: `[MOECISH] ${yearROC} 年度資通安全稽核 進度追蹤提醒`,
        body:
          `${u.name} 您好，\n\n` +
          `${cycle.organization.name} 的 ${yearROC} 年度資通安全稽核仍有待辦事項，謹此提醒。\n\n` +
          `${focus.hint}\n\n` +
          `請登入平台查看並辦理：\n${link}\n\n` +
          `— MOECISH 資通安全稽核管考平台`,
        kind: 'track-remind',
        relatedCycleId: cycle.id,
        // 同一週期 24h 內對同一收件人只寄一次(防連續點擊重複轟炸;不同週期各自獨立)
        dedupeKey: `track-remind-${cycle.id}`,
        context: { phase: 'track-remind', triggeredBy: opts.triggeredById, status: cycle.status },
      }),
    ),
  );
  // 誠實回報:24h 內重複點擊會被 sendEmail 去重(status=skipped),故區分「實際寄出」與「今日已提醒過而略過」。
  const sentCount = results.filter((r) => r.status === 'sent' || r.status === 'simulated').length;
  const skippedCount = results.filter((r) => r.status === 'skipped').length;

  // 催辦軌跡:此週期累計實際寄出(sent/simulated)之「一鍵催辦」信封數(含本次;24h 內去重的重複點擊不計入)。
  // 用獨立 kind='track-remind' 查詢,不與一般 tracking 追蹤信 / 自動催繳排程(run-tracking)/ 手動群發混淆。
  const remindCount = await prisma.emailLog.count({
    where: { relatedCycleId: cycle.id, kind: 'track-remind', status: { in: ['sent', 'simulated'] } },
  });

  return { cycleId: cycle.id, recipientCount: recipients.length, sentCount, skippedCount, remindCount };
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
    where: orgAdminWhere(cycle.organizationId),
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
        dedupeKey: `status-${cycle.id}-${opts.status}`,
        context: { status: opts.status },
      }),
    ),
  );
  return { recipientCount: recipients.length };
}

// ════════════════════════════════════════════
// 批71:缺失持續列管通知(事件驅動,非週期狀態轉換 → 不受 notify-policy 矩陣約束)
// ════════════════════════════════════════════

/** 列管項標籤:構面－類型 第 N 項(通知內文共用;run-tracking 催辦信亦引用)。 */
export function trackedItemLabel(t: { aspect: string; type: string; itemNo: number }): string {
  return `${DEFICIENCY_ASPECT_LABELS[t.aspect as DeficiencyAspect]}－${DEFICIENCY_TYPE_LABELS[t.type as DeficiencyType]} 第 ${t.itemNo} 項`;
}

/** 缺失拋轉持續列管 → 通知機關「此缺失轉入持續列管,首次回報期限 X」。 */
export async function notifyTrackedCreated(opts: { deficiencyId: string; appBaseUrl: string }) {
  const tracked = await prisma.trackedDeficiency.findUnique({
    where: { deficiencyId: opts.deficiencyId },
    include: { organization: true },
  });
  if (!tracked) return { recipientCount: 0 };

  const recipients = await prisma.user.findMany({ where: orgAdminWhere(tracked.organizationId) });
  if (recipients.length === 0) return { recipientCount: 0 };

  const link = `${opts.appBaseUrl}/tracking`;
  const originYearROC = tracked.originYear - 1911;
  const dueStr = fmtROC(tracked.nextReportDue);
  const label = trackedItemLabel(tracked);

  await Promise.all(
    recipients.map((u) =>
      sendEmail({
        to: u.email,
        toName: u.name,
        subject: `[MOECISH] 缺失已轉入持續列管，請依期回報改善進度`,
        body:
          `${u.name} 您好，\n\n` +
          `${tracked.organization.name} ${originYearROC} 年度稽核之「${label}」因尚在辦理中，經審核後已轉入「缺失持續列管」，將跨年度滾動追蹤至改善完成。\n\n` +
          `首次回報期限：${dueStr}。請於期限前登入平台回報最新進度並上傳佐證：\n\n` +
          `${link}\n\n` +
          `— MOECISH 資通安全稽核管考平台`,
        kind: 'tracked-created',
        notificationLink: '/tracking',
        // 同一列管項對同一機關 24h 去重(冪等 upsert 重審不重複轟炸)
        dedupeKey: `tracked-created-${tracked.id}`,
        context: { trackedId: tracked.id, deficiencyId: opts.deficiencyId },
      }),
    ),
  );
  return { recipientCount: recipients.length };
}

/** 機關送出列管回報 → 通知中心(最高管理員)+ 協審委員(若有指派且在職)。 */
export async function notifyTrackedReportSubmitted(opts: { reportId: string; appBaseUrl: string }) {
  const report = await prisma.trackedReport.findUnique({
    where: { id: opts.reportId },
    include: { tracked: { include: { organization: true } } },
  });
  if (!report) return { recipientCount: 0 };
  const tracked = report.tracked;

  const center = await prisma.user.findMany({ where: { role: 'SUPER_ADMIN', isActive: true } });
  const auditor = tracked.assignedAuditorId
    ? await prisma.user.findFirst({ where: { id: tracked.assignedAuditorId, isActive: true } })
    : null;
  const recipients = [...center, ...(auditor ? [auditor] : [])];
  if (recipients.length === 0) return { recipientCount: 0 };

  const link = `${opts.appBaseUrl}/tracking`;
  const orgName = tracked.organization.shortName ?? tracked.organization.name;
  const label = trackedItemLabel(tracked);

  await Promise.all(
    recipients.map((u) =>
      sendEmail({
        to: u.email,
        toName: u.name,
        subject: `[MOECISH] ${orgName} 已回報持續列管缺失進度，敬請審核`,
        body:
          `${u.name} 您好，\n\n` +
          `${tracked.organization.name} 已回報持續列管缺失「${label}」的最新改善進度，請登入平台檢視進度說明與佐證並審核（通過續列管／認可完成／退回補正）：\n\n` +
          `${link}\n\n` +
          `— MOECISH 資通安全稽核管考平台`,
        kind: 'tracked-report',
        notificationLink: '/tracking',
        context: { trackedId: tracked.id, reportId: report.id },
      }),
    ),
  );
  return { recipientCount: recipients.length };
}

/** 中心/協審委員審核列管回報 → 通知機關結果(退回附理由;認可完成則告知結案)。 */
export async function notifyTrackedReviewed(opts: { reportId: string; appBaseUrl: string }) {
  const report = await prisma.trackedReport.findUnique({
    where: { id: opts.reportId },
    include: { tracked: { include: { organization: true } } },
  });
  if (!report) return { recipientCount: 0 };
  const tracked = report.tracked;

  const recipients = await prisma.user.findMany({ where: orgAdminWhere(tracked.organizationId) });
  if (recipients.length === 0) return { recipientCount: 0 };

  const link = `${opts.appBaseUrl}/tracking`;
  const label = trackedItemLabel(tracked);
  const decisionLabel = TRACKED_REVIEW_STATUS_LABELS[report.reviewStatus as TrackedReviewStatus] ?? report.reviewStatus;
  const noteBlock = report.reviewNote?.trim() ? `審核意見：\n${report.reviewNote.trim()}\n\n` : '';
  const nextBlock =
    report.reviewStatus === 'COMPLETE'
      ? '本缺失已認可完成、結束列管，無須再回報。\n\n'
      : report.reviewStatus === 'RETURNED'
      ? '請依審核意見補充後重新回報。\n\n'
      : `本缺失仍持續列管，下次回報期限：${fmtROC(tracked.nextReportDue)}。\n\n`;

  await Promise.all(
    recipients.map((u) =>
      sendEmail({
        to: u.email,
        toName: u.name,
        subject: `[MOECISH] 持續列管缺失回報審核結果：${decisionLabel}`,
        body:
          `${u.name} 您好，\n\n` +
          `${tracked.organization.name} 持續列管缺失「${label}」的進度回報，審核結果為「${decisionLabel}」。\n\n` +
          noteBlock +
          nextBlock +
          `詳情請登入平台查看：\n${link}\n\n` +
          `— MOECISH 資通安全稽核管考平台`,
        kind: 'tracked-reviewed',
        notificationLink: '/tracking',
        context: { trackedId: tracked.id, reportId: report.id, decision: report.reviewStatus },
      }),
    ),
  );
  return { recipientCount: recipients.length };
}
