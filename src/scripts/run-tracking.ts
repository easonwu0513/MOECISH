/**
 * 自動追蹤信(systemd timer 每日執行):
 *   npm run track:run
 *
 * 規則(對 REMEDIATION 中的週期):
 *   - D-7:矯正截止前 7 天,尚有未通過項 → 提醒機關管理員
 *   - D-1:截止前 1 天 → 再次提醒
 *   - 逾期:已過截止且未全數通過 → 每次執行提醒(timer 日跑,即每日一封)
 * 去重:同一週期同一觸發類型當日已寄過(EmailLog context.autoKey)則跳過。
 *
 * 批72 增段(對 status=TRACKING 的持續列管缺失,獨立於上方週期矯正追蹤):
 *   - D-7:回報期限 7 天內且未有待審回報 → 提醒機關(每期限一次)
 *   - 逾期:已過期限未回報 → 每 7 天提醒機關一次(半年週期,日寄=轟炸)
 *   - 逾期 ≥14 天:另通知中心(每期限一次)
 * 同機關多筆同觸發合併一封(半年到期常成批);去重鍵含期限日,續列管後新期限重新起算。
 *
 * 寄送經 src/lib/email.ts(Graph 已啟用即真寄;未啟用記錄為模擬)。
 */
import { prisma } from '../lib/db';
import { sendEmail } from '../lib/email';
import { orgAdminWhere, trackedItemLabel } from '../lib/notify';
import { fmtROC } from '../lib/date';

const APP_BASE = process.env.NEXTAUTH_URL ?? 'http://localhost:3001';

function dayStart(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}
function daysUntil(due: Date, now: Date): number {
  return Math.floor((dayStart(due).getTime() - dayStart(now).getTime()) / 86400000);
}

async function alreadySentToday(autoKey: string): Promise<boolean> {
  const todayStart = dayStart(new Date());
  const hit = await prisma.emailLog.findFirst({
    where: {
      kind: 'tracking',
      sentAt: { gte: todayStart },
      context: { contains: `"autoKey":"${autoKey}"` },
    },
    select: { id: true },
  });
  return hit !== null;
}

/** 整週期級去重:此 cycle+trigger 是否曾寄過(D-7/D-1 一次性提醒用) */
async function alreadySentEver(autoKey: string): Promise<boolean> {
  const hit = await prisma.emailLog.findFirst({
    where: { kind: 'tracking', context: { contains: `"autoKey":"${autoKey}"` } },
    select: { id: true },
  });
  return hit !== null;
}

/** 批72:持續列管催辦鍵是否已寄過(kind='tracked-due')。合併信把各項鍵以「|」夾邊存於
 *  context.autoKeys(如 "|k1|k2|"),查詢以 |鍵| 子字串比對——夾邊避免 OD1 誤中 OD10。 */
async function trackedKeySent(key: string): Promise<boolean> {
  const hit = await prisma.emailLog.findFirst({
    where: { kind: 'tracked-due', context: { contains: `|${key}|` } },
    select: { id: true },
  });
  return hit !== null;
}

/** #5:事前場次調查自訂填報欄位催辦鍵是否已寄過(kind='presurvey-cv-due';autoKeys 以 |鍵| 夾邊比對,避免子字串誤中)。 */
async function pcvKeySent(key: string): Promise<boolean> {
  const hit = await prisma.emailLog.findFirst({
    where: { kind: 'presurvey-cv-due', context: { contains: `|${key}|` } },
    select: { id: true },
  });
  return hit !== null;
}

/** 解析 customValues JSON(Record<columnId,string>);壞資料回空物件。 */
function parseCustomValues(json: string | null): Record<string, string> {
  if (!json) return {};
  try {
    const o = JSON.parse(json);
    return o && typeof o === 'object' && !Array.isArray(o) ? (o as Record<string, string>) : {};
  } catch {
    return {};
  }
}

async function main() {
  const now = new Date();
  console.log(`[track] run at ${now.toISOString()}`);

  const cycles = await prisma.auditCycle.findMany({
    where: { status: 'REMEDIATION' },
    include: {
      organization: true,
      deficiencies: { include: { action: { select: { status: true } } } },
    },
  });

  let sentCount = 0;

  for (const c of cycles) {
    const unfinished = c.deficiencies.filter((d) => d.action?.status !== 'PASSED').length;
    const returned = c.deficiencies.filter((d) => d.action?.status === 'RETURNED').length;
    if (unfinished === 0) continue;
    if (!c.dueDate) continue; // 尚未設定矯正填報截止 → 無截止可追蹤,略過

    // 改用區間判斷:timer 若漏跑某一天,進入視窗後仍會補寄(配合週期級去重避免重發)
    const dleft = daysUntil(c.dueDate, now);
    let trigger: 'D7' | 'D1' | 'OVERDUE' | null = null;
    if (dleft <= 7 && dleft >= 2) trigger = 'D7';
    else if (dleft <= 1 && dleft >= 0) trigger = 'D1';
    else if (dleft < 0) trigger = 'OVERDUE';
    if (!trigger) continue;

    const autoKey = `${c.id}:${trigger}`;
    // D-7/D-1 為一次性提醒(整週期去重);逾期為每日提醒(當日去重)
    const already = trigger === 'OVERDUE'
      ? await alreadySentToday(autoKey)
      : await alreadySentEver(autoKey);
    if (already) {
      console.log(`[track] skip (already sent): ${autoKey}`);
      continue;
    }

    const recipients = await prisma.user.findMany({
      where: orgAdminWhere(c.organizationId),
    });
    if (recipients.length === 0) {
      console.log(`[track] skip cycle ${c.id}:無在職機關管理員(含多重身分授權)`);
      continue;
    }

    const yearROC = c.year - 1911;
    const due = new Date(c.dueDate).toLocaleDateString('zh-TW');
    const link = `${APP_BASE}/cycles/${c.id}/deficiencies`;

    const subject =
      trigger === 'OVERDUE'
        ? `[MOECISH] 矯正填報已逾期通知 — ${yearROC} 年度 ${c.organization.name}`
        : `[MOECISH] 矯正填報截止提醒(剩 ${dleft} 天)— ${yearROC} 年度`;

    const tone =
      trigger === 'OVERDUE'
        ? `貴機關 ${yearROC} 年度資通安全稽核矯正填報已逾截止日(${due}),`
        : `貴機關 ${yearROC} 年度資通安全稽核矯正填報將於 ${due} 截止,`;

    const body =
      `您好,\n\n` +
      tone +
      `目前尚有 ${unfinished} 項未完成` +
      (returned > 0 ? `(其中 ${returned} 項遭退回待補正)` : '') +
      `。請儘速登入系統完成填報與佐證上傳:\n\n${link}\n\n` +
      `— MOECISH 資通安全稽核管考平台(系統自動發送)`;

    for (const r of recipients) {
      await sendEmail({
        to: r.email,
        toName: r.name,
        subject,
        body,
        kind: 'tracking',
        relatedCycleId: c.id,
        context: { autoKey, trigger, unfinished, returned, auto: true },
      });
      sentCount++;
    }
    console.log(`[track] sent ${trigger} for cycle ${c.id} (${c.organization.name}) → ${recipients.length} recipients`);
  }

  // ── 批72:持續列管缺失到期催辦(跨年度滾動,與上方週期矯正追蹤獨立) ──
  const trackedAll = await prisma.trackedDeficiency.findMany({
    where: { status: 'TRACKING' },
    include: {
      organization: { select: { name: true } },
      reports: { where: { reviewStatus: 'PENDING' }, select: { id: true } },
    },
  });

  type TrackedRow = (typeof trackedAll)[number];
  type Entry = { t: TrackedRow; key: string };
  const byOrg = new Map<string, { orgName: string; d7: Entry[]; od: Entry[]; esc: Entry[] }>();
  for (const t of trackedAll) {
    if (t.reports.length > 0) continue; // 已回報待審 → 球在審核方,不催機關
    const dleft = daysUntil(t.nextReportDue, now);
    const dueKey = t.nextReportDue.toISOString().slice(0, 10); // 期限日=去重世代;續列管換期限即重新起算
    const g = byOrg.get(t.organizationId) ?? { orgName: t.organization.name, d7: [], od: [], esc: [] };
    if (dleft >= 0 && dleft <= 7) {
      const key = `tracked:${t.id}:${dueKey}:D7`;
      if (!(await trackedKeySent(key))) g.d7.push({ t, key });
    } else if (dleft < 0) {
      const week = Math.floor(-dleft / 7); // 逾期第 0/7/14… 天各一次 → 每 7 天一封
      const odKey = `tracked:${t.id}:${dueKey}:OD${week}`;
      if (!(await trackedKeySent(odKey))) g.od.push({ t, key: odKey });
      if (-dleft >= 14) {
        const escKey = `tracked:${t.id}:${dueKey}:ESC`;
        if (!(await trackedKeySent(escKey))) g.esc.push({ t, key: escKey });
      }
    }
    byOrg.set(t.organizationId, g);
  }

  const itemLine = (t: TrackedRow) =>
    `・${trackedItemLabel(t)}(來源 ${t.originYear - 1911} 年度;回報期限 ${fmtROC(t.nextReportDue)})`;
  const keysCtx = (entries: Entry[]) => `|${entries.map((e) => e.key).join('|')}|`;
  const trackingLink = `${APP_BASE}/tracking`;

  // UAT(批H):彙整本日「已自動寄給機關」的催辦,於迴圈後回報中心(最高管理員)完成確認
  const centerDigest: { org: string; d7: number; od: number }[] = [];

  for (const [orgId, g] of byOrg) {
    if (g.d7.length + g.od.length + g.esc.length === 0) continue;

    // 機關收件人(含多重身分授權);無在職管理員時機關信略過,中心升級信仍寄(逾期事實不因無人收信消失)
    const orgRecipients = g.d7.length + g.od.length > 0
      ? await prisma.user.findMany({ where: orgAdminWhere(orgId) })
      : [];

    if (g.d7.length > 0 && orgRecipients.length > 0) {
      const body =
        `您好,\n\n貴機關下列持續列管缺失的回報期限將於 7 天內到期,請於期限前登入平台回報最新改善進度並上傳佐證:\n\n` +
        `${g.d7.map((e) => itemLine(e.t)).join('\n')}\n\n${trackingLink}\n\n` +
        `— MOECISH 資通安全稽核管考平台(系統自動發送)`;
      for (const r of orgRecipients) {
        await sendEmail({
          to: r.email, toName: r.name,
          subject: `[MOECISH] 持續列管缺失回報期限將屆(${g.d7.length} 項)`,
          body, kind: 'tracked-due', notificationLink: '/tracking',
          context: { autoKeys: keysCtx(g.d7), trigger: 'D7', count: g.d7.length, auto: true },
        });
        sentCount++;
      }
      console.log(`[track] tracked D7 for org ${g.orgName} × ${g.d7.length} items → ${orgRecipients.length} recipients`);
    }

    if (g.od.length > 0 && orgRecipients.length > 0) {
      const body =
        `您好,\n\n貴機關下列持續列管缺失已逾回報期限尚未回報,請儘速登入平台回報最新改善進度並上傳佐證:\n\n` +
        `${g.od.map((e) => itemLine(e.t)).join('\n')}\n\n${trackingLink}\n\n` +
        `— MOECISH 資通安全稽核管考平台(系統自動發送)`;
      for (const r of orgRecipients) {
        await sendEmail({
          to: r.email, toName: r.name,
          subject: `[MOECISH] 持續列管缺失回報已逾期(${g.od.length} 項),請儘速回報`,
          body, kind: 'tracked-due', notificationLink: '/tracking',
          context: { autoKeys: keysCtx(g.od), trigger: 'OVERDUE', count: g.od.length, auto: true },
        });
        sentCount++;
      }
      console.log(`[track] tracked OVERDUE for org ${g.orgName} × ${g.od.length} items → ${orgRecipients.length} recipients`);
    }

    // 本輪確有寄給機關(D-7 或逾期)→ 納入回報中心的彙整
    if (orgRecipients.length > 0 && (g.d7.length > 0 || g.od.length > 0)) {
      centerDigest.push({ org: g.orgName, d7: g.d7.length, od: g.od.length });
    }

    if (g.esc.length > 0) {
      const center = await prisma.user.findMany({ where: { role: 'SUPER_ADMIN', isActive: true } });
      if (center.length > 0) {
        const body =
          `您好,\n\n${g.orgName} 下列持續列管缺失已逾回報期限 14 天以上仍未回報,請協助關注或催辦:\n\n` +
          `${g.esc.map((e) => itemLine(e.t)).join('\n')}\n\n${trackingLink}\n\n` +
          `— MOECISH 資通安全稽核管考平台(系統自動發送)`;
        for (const r of center) {
          await sendEmail({
            to: r.email, toName: r.name,
            subject: `[MOECISH] ${g.orgName} 持續列管缺失逾期未回報已逾 14 天(${g.esc.length} 項)`,
            body, kind: 'tracked-due', notificationLink: '/tracking',
            context: { autoKeys: keysCtx(g.esc), trigger: 'ESCALATE', count: g.esc.length, auto: true },
          });
          sentCount++;
        }
        console.log(`[track] tracked ESCALATE for org ${g.orgName} × ${g.esc.length} items → ${center.length} center recipients`);
      }
    }
  }

  // UAT(批H):本日已自動寄出機關催辦 → 彙整回報中心(最高管理員),email + 站內,同日去重。
  // 讓中心知道「系統已自動完成催辦」,無須自行寄信;需個別催辦時可於列管頁逐項手動催辦。
  if (centerDigest.length > 0) {
    const center = await prisma.user.findMany({ where: { role: 'SUPER_ADMIN', isActive: true } });
    const totalItems = centerDigest.reduce((s, d) => s + d.d7 + d.od, 0);
    const dateStr = now.toISOString().slice(0, 10);
    const body =
      `您好,\n\n本日系統已自動寄出下列持續列管缺失的回報催辦通知予受稽機關(共 ${centerDigest.length} 家機關、${totalItems} 項):\n\n` +
      centerDigest
        .map((d) => `・${d.org}:${[d.d7 ? `即將到期 ${d.d7} 項` : '', d.od ? `逾期 ${d.od} 項` : ''].filter(Boolean).join('、')}`)
        .join('\n') +
      `\n\n您無須另行寄信;如需個別加強催辦,可於「缺失持續列管」頁逐項點「催辦回報」。\n\n${trackingLink}\n\n` +
      `— MOECISH 資通安全稽核管考平台(系統自動發送)`;
    for (const r of center) {
      await sendEmail({
        to: r.email, toName: r.name,
        subject: `[MOECISH] 本日已自動寄出持續列管催辦(${centerDigest.length} 機關／${totalItems} 項)`,
        body, kind: 'tracked-due', notificationLink: '/tracking',
        context: { trigger: 'CENTER_DIGEST', orgs: centerDigest.length, items: totalItems, auto: true },
        dedupeKey: `tracked-due-digest-${dateStr}`,
      });
      sentCount++;
    }
    console.log(`[track] tracked CENTER DIGEST × ${centerDigest.length} orgs / ${totalItems} items → ${center.length} center recipients`);
  }

  // ── #5:事前場次調查「中心指定填報欄位」到期催辦(selfEditable + 有到期日;催受調者本人) ──
  // 對每位受調者,把其名下「該欄仍為空 且 進入催辦視窗」的欄位彙整成一封(到期前 7 日內一次、逾期每 7 天一次)。
  const cvCols = await prisma.surveyCustomColumn.findMany({
    where: { selfEditable: true, dueDate: { not: null } },
    select: { id: true, year: true, kind: true, title: true, dueDate: true },
  });
  if (cvCols.length > 0) {
    const yearsInvolved = [...new Set(cvCols.map((c) => c.year))];
    for (const y of yearsInvolved) {
      const yearCols = cvCols.filter((c) => c.year === y);
      const parts = await prisma.surveyParticipant.findMany({
        where: { year: y },
        select: {
          id: true,
          kind: true,
          customValues: true,
          user: { select: { name: true, email: true, isActive: true } },
        },
      });
      for (const p of parts) {
        if (!p.user.isActive) continue; // 停用帳號不催
        const values = parseCustomValues(p.customValues);
        const entries: { title: string; due: Date; overdue: boolean; key: string }[] = [];
        for (const col of yearCols) {
          if (col.kind && col.kind !== p.kind) continue; // UAT 圖58:欄位歸屬類別不符者不催
          if ((values[col.id] ?? '').trim().length > 0) continue; // 已填 → 不催
          const due = col.dueDate!; // where dueDate not null 已保證
          const dleft = daysUntil(due, now);
          const dueKey = due.toISOString().slice(0, 10); // 到期日=去重世代;改期即重新起算
          let key: string | null = null;
          let overdue = false;
          if (dleft >= 0 && dleft <= 7) {
            key = `pcv:${col.id}:${p.id}:${dueKey}:D7`;
          } else if (dleft < 0) {
            overdue = true;
            const week = Math.floor(-dleft / 7); // 逾期第 0/7/14… 天各一次 → 每 7 天一封
            key = `pcv:${col.id}:${p.id}:${dueKey}:OD${week}`;
          }
          if (!key || (await pcvKeySent(key))) continue;
          entries.push({ title: col.title, due, overdue, key });
        }
        if (entries.length === 0) continue;

        const yearROC = y - 1911;
        const link = `${APP_BASE}/pre-survey`;
        const anyOverdue = entries.some((e) => e.overdue);
        const lines = entries.map((e) => `・${e.title}（到期日 ${fmtROC(e.due)}${e.overdue ? '；已逾期' : ''}）`).join('\n');
        const body =
          `${p.user.name} 您好，\n\n` +
          `${yearROC} 年度事前場次調查尚有下列由中心指定、須由您填報的欄位${anyOverdue ? '已逾期或即將到期' : '即將到期'}，請儘速登入平台填寫：\n\n` +
          `${lines}\n\n${link}\n\n` +
          `— 教育部轄下醫療領域資訊安全推動中心（系統自動發送）`;
        await sendEmail({
          to: p.user.email,
          toName: p.user.name,
          subject: `[MOECISH] ${yearROC} 年度事前場次調查——請填報指定欄位（${entries.length} 項）`,
          body,
          kind: 'presurvey-cv-due',
          notificationLink: '/pre-survey',
          context: { autoKeys: `|${entries.map((e) => e.key).join('|')}|`, year: y, count: entries.length, auto: true },
        });
        sentCount++;
        console.log(`[track] presurvey-cv-due for ${p.user.name} (${yearROC}) × ${entries.length} fields`);
      }
    }
  }

  console.log(`[track] done. total sent: ${sentCount}`);
}

main()
  .catch((e) => {
    console.error('[track] failed:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
