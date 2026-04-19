import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { prisma } from './db';

const STORAGE_DIR = process.env.STORAGE_DIR ?? './uploads';

export type EmailKind = 'invitation' | 'cycle-notify' | 'password-reset' | 'other';

export type SendEmailInput = {
  to: string;
  toName?: string;
  subject: string;
  body: string;        // plain text or simple HTML
  kind?: EmailKind;
  context?: Record<string, unknown>;
  relatedInvitationId?: string;
  relatedCycleId?: string;
};

/**
 * Prototype email transport.
 * - Writes EmailLog row for admin viewer
 * - Also writes .eml-ish text file to uploads/emails/ for local inspection
 * - Swap this for real SMTP (nodemailer) later without touching callers.
 */
export async function sendEmail(input: SendEmailInput) {
  const kind: EmailKind = input.kind ?? 'other';

  const log = await prisma.emailLog.create({
    data: {
      toEmail: input.to,
      toName: input.toName ?? null,
      subject: input.subject,
      body: input.body,
      kind,
      context: input.context ? JSON.stringify(input.context) : null,
      relatedInvitationId: input.relatedInvitationId ?? null,
      relatedCycleId: input.relatedCycleId ?? null,
    },
  });

  try {
    const dir = path.join(STORAGE_DIR, 'emails');
    await mkdir(dir, { recursive: true });
    const safeSubject = input.subject.replace(/[^\w\-\u4e00-\u9fff]/g, '_').slice(0, 40);
    const fileName = `${log.sentAt.toISOString().replace(/[:.]/g, '-')}_${safeSubject}_${log.id.slice(-6)}.txt`;
    const content =
      `To: ${input.toName ? `${input.toName} <${input.to}>` : input.to}\n` +
      `Kind: ${kind}\n` +
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
