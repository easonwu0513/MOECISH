import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { prisma } from './db';
import { isGraphConfigured, sendGraphMail } from './graph-mail';
import { STORAGE_DIR } from './storage';

export type EmailKind =
  | 'invitation'
  | 'cycle-notify'
  | 'tracking'
  | 'password-reset'
  | 'review-request'   // 機關送審 → 通知委員
  | 'action-returned'  // 委員退回 → 通知機關
  | 'all-passed'       // 全數通過 → 通知機關用印
  | 'checklist-submitted' // 檢核表填報送出 → 通知委員
  | 'checklist-reopened'  // 檢核表退回重填 → 通知機關
  | 'prep-submitted'      // 機關確定繳交稽核前資料 → 通知中心
  | 'prep-returned'       // 中心退回稽核前資料 → 通知機關
  | 'checklist-review-done' // 委員完成檢核表審閱意見 → 通知中心
  | 'audit-score-lock'    // 委員確認填寫完畢、鎖定實地稽核評分/發現 → 通知中心
  | 'audit-score-unlock'  // 委員解除實地稽核評分/發現鎖定、修改 → 通知中心
  | 'health-alert'        // 系統健康警報(監控)
  | 'other';

export type SendEmailInput = {
  to: string;
  toName?: string;
  subject: string;
  body: string;        // plain text
  kind?: EmailKind;
  context?: Record<string, unknown>;
  relatedInvitationId?: string;
  relatedCycleId?: string;
  /** 去重鍵:同 kind+to+dedupeKey 在 24h 內已真寄成功過則跳過(防轟炸)。不給 = 不去重。 */
  dedupeKey?: string;
};

const DEDUPE_WINDOW_MS = 24 * 60 * 60 * 1000;

/**
 * 寄信主通道:
 * 1. 永遠寫入 EmailLog(管理介面可查)
 * 2. Graph token 已初始化 → 經 moecish@ 真實寄出(失敗不擋業務流程,記錄錯誤)
 * 3. 未初始化 → 僅記錄(信件以 .txt 落地供檢視),context 標記 simulated
 * 4. dedupeKey 有給且 24h 內同 kind+收件人+鍵已寄成功 → 跳過(EmailLog 記 skipped)
 */
export async function sendEmail(input: SendEmailInput) {
  const kind: EmailKind = input.kind ?? 'other';

  // 通知節流:重複觸發(例:連續點送出、排程重跑)不重複轟炸收件人
  if (input.dedupeKey) {
    const dup = await prisma.emailLog.findFirst({
      where: {
        kind,
        toEmail: input.to,
        sentAt: { gte: new Date(Date.now() - DEDUPE_WINDOW_MS) },
        context: { contains: `"dedupeKey":${JSON.stringify(input.dedupeKey)}` },
      },
      orderBy: { sentAt: 'desc' },
    });
    if (dup) {
      try {
        const c = dup.context ? JSON.parse(dup.context) : {};
        if (c.delivery === 'sent' || c.delivery === 'simulated') {
          return prisma.emailLog.create({
            data: {
              toEmail: input.to,
              toName: input.toName ?? null,
              subject: input.subject,
              body: input.body,
              kind,
              context: JSON.stringify({
                ...(input.context ?? {}),
                dedupeKey: input.dedupeKey,
                delivery: 'skipped',
                skippedBecause: dup.id,
              }),
              relatedInvitationId: input.relatedInvitationId ?? null,
              relatedCycleId: input.relatedCycleId ?? null,
            },
          });
        }
      } catch { /* context 解析失敗就照常寄 */ }
    }
  }

  const graphReady = await isGraphConfigured();
  let delivery: 'sent' | 'failed' | 'simulated' = 'simulated';
  let deliveryError: string | undefined;

  if (graphReady) {
    try {
      await sendGraphMail({
        to: input.to,
        toName: input.toName,
        subject: input.subject,
        bodyText: input.body,
      });
      delivery = 'sent';
    } catch (e) {
      delivery = 'failed';
      deliveryError = (e as Error).message;
      console.error('[email] Graph 寄送失敗:', deliveryError);
    }
  }

  const log = await prisma.emailLog.create({
    data: {
      toEmail: input.to,
      toName: input.toName ?? null,
      subject: input.subject,
      body: input.body,
      kind,
      context: JSON.stringify({
        ...(input.context ?? {}),
        ...(input.dedupeKey ? { dedupeKey: input.dedupeKey } : {}),
        delivery,
        ...(deliveryError ? { deliveryError } : {}),
      }),
      relatedInvitationId: input.relatedInvitationId ?? null,
      relatedCycleId: input.relatedCycleId ?? null,
    },
  });

  // 個資保護:正式環境不另外落地含姓名/Email/內文的明文信件副本
  // (DB EmailLog 已是唯一真實來源);僅在非正式環境保留 .txt 供開發/示範檢視。
  if (process.env.NODE_ENV !== 'production') try {
    const dir = path.join(STORAGE_DIR, 'emails');
    await mkdir(dir, { recursive: true });
    const safeSubject = input.subject.replace(/[^\w\-一-鿿]/g, '_').slice(0, 40);
    const fileName = `${log.sentAt.toISOString().replace(/[:.]/g, '-')}_${safeSubject}_${log.id.slice(-6)}.txt`;
    const content =
      `To: ${input.toName ? `${input.toName} <${input.to}>` : input.to}\n` +
      `Kind: ${kind}\n` +
      `Delivery: ${delivery}${deliveryError ? ` (${deliveryError})` : ''}\n` +
      `Sent: ${log.sentAt.toISOString()}\n` +
      `Subject: ${input.subject}\n` +
      `${input.relatedInvitationId ? `Invitation: ${input.relatedInvitationId}\n` : ''}` +
      `${input.relatedCycleId ? `Cycle: ${input.relatedCycleId}\n` : ''}` +
      `\n${input.body}\n`;
    await writeFile(path.join(dir, fileName), content, 'utf-8');
  } catch (e) {
    console.warn('[email] failed to write log file:', (e as Error).message);
  }

  return log;
}
