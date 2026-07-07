import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { auth } from '@/lib/auth';
import { errorResponse } from '@/lib/api';
import { writeAuditLog, extractRequestMeta } from '@/lib/audit-log';
import { notifyAuditScoreReturned } from '@/lib/notify';
import { canAssignAuditors } from '@/lib/stage';
import type { CycleStatus } from '@/lib/types';
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
    // 名單凍結同適用於「退件」(批34 圖7):實地稽核結束(缺失發布起)後,委員評分已定稿並已彙整/
    // 轉入缺失,退件重評會讓評分與已發布缺失脫鉤——比照 canAssignAuditors 於 REPORT_ISSUED 起凍結,
    // 不可再退件(如確需修正,須將週期回退至實地稽核後處理,屬重大操作)。CLOSED 亦涵蓋於此。
    if (!canAssignAuditors(cycle.status as CycleStatus)) {
      return NextResponse.json(
        { error: '實地稽核階段已結束,委員評分已定稿凍結,不可退件。如確需修正,請先將週期回退至「實地稽核」後處理(重大操作,請審慎)' },
        { status: 409 },
      );
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
