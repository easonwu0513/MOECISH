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

    // 以可查詢的 status 欄為準;失敗或死信(自動補寄達上限)皆可人工重寄
    if (log.status !== 'failed' && log.status !== 'dead-letter') {
      return NextResponse.json(
        { error: '只有「寄送失敗」或「死信」的信可重寄（避免重複寄出）' },
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

    const reDelivery = re.status; // sendEmail 已同步寫入 status 欄

    // 人工重寄成功 → 將原紀錄標記為已解決(sent),避免自動補寄 timer 再次撿取
    if (reDelivery === 'sent') {
      await prisma.emailLog.update({
        where: { id: log.id },
        data: { status: 'sent' },
      });
    }

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
