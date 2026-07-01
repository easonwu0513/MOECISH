import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { auth } from '@/lib/auth';
import { errorResponse } from '@/lib/api';
import { writeAuditLog, extractRequestMeta } from '@/lib/audit-log';
import { notifyAuditScoreReturned } from '@/lib/notify';
import { appBaseUrl } from '@/lib/baseUrl';

const Body = z.object({
  auditorId: z.string().min(1),
  reason: z.string().trim().max(500).optional(),
});

/**
 * 最高管理員「退件」:解除某委員已定稿(scoreLockedAt)的實地稽核評分與發現,
 * 使該委員可重新編輯;以站內通知告知該委員(不寄 email,退件於現場口頭告知),並寫稽核軌跡。
 * 僅 SUPER_ADMIN;委員自鎖/自解見 ../lock。
 */
export async function POST(req: Request, { params }: { params: { id: string } }) {
  try {
    const session = await auth();
    if (!session) return NextResponse.json({ error: '未登入' }, { status: 401 });
    if (session.user.role !== 'SUPER_ADMIN') {
      return NextResponse.json({ error: '僅最高管理員可退件' }, { status: 403 });
    }

    const cycle = await prisma.auditCycle.findUnique({ where: { id: params.id } });
    if (!cycle) return NextResponse.json({ error: '稽核週期不存在' }, { status: 404 });
    if (cycle.status === 'CLOSED') {
      return NextResponse.json({ error: '已結案的週期不可退件' }, { status: 409 });
    }

    const { auditorId, reason } = Body.parse(await req.json());
    const assignment = await prisma.auditorAssignment.findUnique({
      where: { cycleId_auditorId: { cycleId: cycle.id, auditorId } },
    });
    if (!assignment) {
      return NextResponse.json({ error: '該委員未被指派此稽核週期' }, { status: 404 });
    }
    if (!assignment.scoreLockedAt) {
      return NextResponse.json({ error: '該委員尚未確認填寫完畢,無需退件' }, { status: 409 });
    }

    await prisma.auditorAssignment.update({
      where: { id: assignment.id },
      data: { scoreLockedAt: null },
    });

    await writeAuditLog({
      actorId: session.user.id,
      action: 'audit.score.return',
      entityType: 'AuditorAssignment',
      entityId: assignment.id,
      after: { cycleId: cycle.id, auditorId, returned: true, reason: reason ?? null },
      ...extractRequestMeta(req),
    });

    // 通知該委員(失敗不擋退件)
    let notified = 0;
    try {
      const r = await notifyAuditScoreReturned({ cycleId: cycle.id, auditorId, reason, appBaseUrl: appBaseUrl(req) });
      notified = r.recipientCount;
    } catch (e) {
      console.error('[audit.return] 通知失敗:', e);
    }

    return NextResponse.json({ ok: true, notified });
  } catch (e) {
    return errorResponse(e);
  }
}
