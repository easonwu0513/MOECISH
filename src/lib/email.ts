import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { prisma } from './db';
import { isGraphConfigured, sendGraphMail } from './graph-mail';

const STORAGE_DIR = process.env.STORAGE_DIR ?? './uploads';

export type EmailKind = 'invitation' | 'cycle-notify' | 'tracking' | 'password-reset' | 'other';

export type SendEmailInput = {
  to: string;
  toName?: string;
  subject: string;
  body: string;        // plain text
  kind?: EmailKind;
  context?: Record<string, unknown>;
  relatedInvitationId?: string;
  relatedCycleId?: string;
};

/**
 * 寄信主通道:
 * 1. 永遠寫入 EmailLog(管理介面可查)
 * 2. Graph token 已初始化 → 經 moecish@ 真實寄出(失敗不擋業務流程,記錄錯誤)
 * 3. 未初始化 → 僅記錄(信件以 .txt 落地供檢視),context 標記 simulated
 */
export async function sendEmail(input: SendEmailInput) {
  const kind: EmailKind = input.kind ?? 'other';

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
        delivery,
        ...(deliveryError ? { deliveryError } : {}),
      }),
      relatedInvitationId: input.relatedInvitationId ?? null,
      relatedCycleId: input.relatedCycleId ?? null,
    },
  });

  try {
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
