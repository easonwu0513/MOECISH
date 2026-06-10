/**
 * 自動追蹤信(systemd timer 每日執行):
 *   npm run track:run
 *
 * 規則(對 REMEDIATION 中的週期):
 *   - D-7:矯正截止前 7 天,尚有未通過項 → 提醒機關管理員
 *   - D-1:截止前 1 天 → 再次提醒
 *   - 逾期:已過截止且未全數通過 → 每次執行提醒(timer 日跑,即每日一封)
 * 去重:同一週期同一觸發類型當日已寄過(EmailLog context.autoKey)則跳過。
 * 寄送經 src/lib/email.ts(Graph 已啟用即真寄;未啟用記錄為模擬)。
 */
import { prisma } from '../lib/db';
import { sendEmail } from '../lib/email';

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

    const dleft = daysUntil(c.dueDate, now);
    let trigger: 'D7' | 'D1' | 'OVERDUE' | null = null;
    if (dleft === 7) trigger = 'D7';
    else if (dleft === 1) trigger = 'D1';
    else if (dleft < 0) trigger = 'OVERDUE';
    if (!trigger) continue;

    const autoKey = `${c.id}:${trigger}`;
    if (await alreadySentToday(autoKey)) {
      console.log(`[track] skip (today already sent): ${autoKey}`);
      continue;
    }

    const recipients = await prisma.user.findMany({
      where: { organizationId: c.organizationId, role: 'ORG_ADMIN', isActive: true },
    });
    if (recipients.length === 0) continue;

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
      `— MOECISH 教育部資通安全稽核改善管考系統(系統自動發送)`;

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

  console.log(`[track] done. total sent: ${sentCount}`);
}

main()
  .catch((e) => {
    console.error('[track] failed:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
