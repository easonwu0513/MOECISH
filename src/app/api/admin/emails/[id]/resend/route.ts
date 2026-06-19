import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireRole } from '@/lib/rbac';
import { errorResponse } from '@/lib/api';
import { sendEmail, type EmailKind } from '@/lib/email';
import { writeAuditLog, extractRequestMeta } from '@/lib/audit-log';

/** 重寄一封寄送失敗的信(僅最高管理員;成功/模擬的不可重寄以免重複轟炸)。 */
export async function POST(req: Request, { params }: { params: { id: string } }) {
  try {
    const user = await requireRole('SUPER_ADMIN');

    const log = await prisma.emailLog.findUnique({ where: { id: params.id } });
    if (!log) return NextResponse.json({ error: '找不到郵件紀錄' }, { status: 404 });

    let delivery = 'simulated';
    try { delivery = JSON.parse(log.context ?? '{}').delivery ?? 'simulated'; } catch {}
    if (delivery !== 'failed') {
      return NextResponse.json(
        { error: '只有「寄送失敗」的信可重寄(避免重複寄出)' },
        { status: 400 },
      );
    }

    const re = await sendEmail({
      to: log.toEmail,
      toName: log.toName ?? undefined,
      subject: log.subject,
      body: log.body,
      kind: log.kind as EmailKind,
      relatedInvitationId: log.relatedInvitationId ?? undefined,
      relatedCycleId: log.relatedCycleId ?? undefined,
      context: { resendOf: log.id, resentBy: user.name },
    });

    let reDelivery = 'simulated';
    try { reDelivery = JSON.parse(re.context ?? '{}').delivery ?? 'simulated'; } catch {}

    await writeAuditLog({
      actorId: user.id,
      action: 'email.resend',
      entityType: 'EmailLog',
      entityId: log.id,
      after: { newLogId: re.id, delivery: reDelivery },
      ...extractRequestMeta(req),
    });

    return NextResponse.json({ ok: true, delivery: reDelivery, newLogId: re.id });
  } catch (e) {
    return errorResponse(e);
  }
}
