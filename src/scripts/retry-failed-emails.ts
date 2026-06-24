/**
 * 死信補寄(systemd timer 每 10 分鐘執行):npm run email:retry
 *
 * 掃描 status='failed' 且 retryCount < MAX 且距上次重試已過冷卻者,
 * 直接以 sendGraphMail 原地重寄(graph-mail 內已含 HTTP 暫時性失敗重試),
 * 不另開 EmailLog —— 在原紀錄上更新 status / retryCount / lastRetryAt,
 * 確保 retryCount 可追蹤、後台不被重複列洗版。
 *
 * 成功 → status='sent';達上限仍失敗 → status='dead-letter'(改由人工於後台救援)。
 * blue/green 雙實例下不在 Next 行程內掛 setInterval —— 一律由 systemd timer 觸發(單一執行)。
 */
import { prisma } from '../lib/db';
import { isGraphConfigured, sendGraphMail } from '../lib/graph-mail';
import { writeAuditLog } from '../lib/audit-log';

const MAX_RETRY = 3;
const COOLDOWN_MS = 30 * 60 * 1000; // 30 分鐘冷卻,避免對暫時性故障狂打
const BATCH = 50;

function mergeContext(ctx: string | null, extra: Record<string, unknown>): string {
  try {
    return JSON.stringify({ ...(ctx ? JSON.parse(ctx) : {}), ...extra });
  } catch {
    return JSON.stringify(extra);
  }
}

async function main() {
  console.log(`[email-retry] run at ${new Date().toISOString()}`);
  if (!(await isGraphConfigured())) {
    console.log('[email-retry] Graph 未初始化,略過(模擬環境無需補寄)');
    return;
  }

  const cutoff = new Date(Date.now() - COOLDOWN_MS);
  const candidates = await prisma.emailLog.findMany({
    where: {
      status: 'failed',
      retryCount: { lt: MAX_RETRY },
      OR: [{ lastRetryAt: null }, { lastRetryAt: { lte: cutoff } }],
    },
    orderBy: { sentAt: 'asc' },
    take: BATCH,
  });
  console.log(`[email-retry] candidates: ${candidates.length}`);

  let recovered = 0;
  let dead = 0;
  for (const log of candidates) {
    const nextCount = log.retryCount + 1;
    try {
      await sendGraphMail({
        to: log.toEmail,
        toName: log.toName ?? undefined,
        subject: log.subject,
        bodyText: log.body,
      });
      await prisma.emailLog.update({
        where: { id: log.id },
        data: {
          status: 'sent',
          retryCount: nextCount,
          lastRetryAt: new Date(),
          context: mergeContext(log.context, {
            delivery: 'sent',
            autoRetry: nextCount,
            recoveredAt: new Date().toISOString(),
          }),
        },
      });
      await writeAuditLog({
        actorId: null,
        action: 'email.auto-retry.recovered',
        entityType: 'EmailLog',
        entityId: log.id,
        after: { retryCount: nextCount, to: log.toEmail },
      });
      recovered++;
      console.log(`[email-retry] recovered ${log.id} → ${log.toEmail} (try ${nextCount})`);
    } catch (e) {
      const isDead = nextCount >= MAX_RETRY;
      await prisma.emailLog.update({
        where: { id: log.id },
        data: {
          status: isDead ? 'dead-letter' : 'failed',
          retryCount: nextCount,
          lastRetryAt: new Date(),
          context: mergeContext(log.context, {
            delivery: isDead ? 'dead-letter' : 'failed',
            autoRetry: nextCount,
            lastError: (e as Error).message?.slice(0, 300),
          }),
        },
      });
      await writeAuditLog({
        actorId: null,
        action: isDead ? 'email.auto-retry.dead-letter' : 'email.auto-retry.failed',
        entityType: 'EmailLog',
        entityId: log.id,
        after: { retryCount: nextCount, to: log.toEmail },
      });
      if (isDead) dead++;
      console.log(`[email-retry] ${isDead ? 'DEAD-LETTER' : 'still-failed'} ${log.id} (try ${nextCount})`);
    }
  }
  console.log(`[email-retry] done. recovered=${recovered} dead-letter=${dead}`);
}

main()
  .catch((e) => {
    console.error('[email-retry] failed:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
