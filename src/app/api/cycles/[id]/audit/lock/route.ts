import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { assertCycleAccess } from '@/lib/rbac';
import { errorResponse } from '@/lib/api';
import { writeAuditLog, extractRequestMeta } from '@/lib/audit-log';
import { notifyAuditScoreUnlocked } from '@/lib/notify';
import { appBaseUrl } from '@/lib/baseUrl';

const Body = z.object({ locked: z.boolean() });

/**
 * 委員「確認填寫完畢(鎖定)」/「解除鎖定」自己的實地稽核評分與發現。
 * - 鎖定:scoreLockedAt = now;鎖定後 scores / findings 編輯 API 一律擋下(防繞過)。
 * - 解除:清除 scoreLockedAt,並通知最高管理員有內容異動(同時寫稽核軌跡)。
 */
export async function POST(req: Request, { params }: { params: { id: string } }) {
  try {
    const { user, cycle } = await assertCycleAccess(params.id); // AUDITOR 限被指派
    if (user.role !== 'AUDITOR') {
      return NextResponse.json({ error: '僅稽核委員可確認填寫完畢' }, { status: 403 });
    }
    if (cycle.status === 'CLOSED') {
      return NextResponse.json({ error: '已結案的週期不可變更' }, { status: 409 });
    }
    const assignment = await prisma.auditorAssignment.findUnique({
      where: { cycleId_auditorId: { cycleId: cycle.id, auditorId: user.id } },
    });
    if (!assignment) {
      return NextResponse.json({ error: '您未被指派此稽核週期' }, { status: 403 });
    }
    const { locked } = Body.parse(await req.json());

    await prisma.auditorAssignment.update({
      where: { id: assignment.id },
      data: { scoreLockedAt: locked ? new Date() : null },
    });

    await writeAuditLog({
      actorId: user.id,
      action: locked ? 'audit.score.lock' : 'audit.score.unlock',
      entityType: 'AuditorAssignment',
      entityId: assignment.id,
      after: { cycleId: cycle.id, locked },
      ...extractRequestMeta(req),
    });

    // 解除鎖定 → 通知最高管理員有內容異動(失敗不擋操作)
    let notified = 0;
    if (!locked) {
      try {
        const r = await notifyAuditScoreUnlocked({
          cycleId: cycle.id,
          auditorName: user.name,
          appBaseUrl: appBaseUrl(req),
        });
        notified = r.recipientCount;
      } catch (e) {
        console.error('[audit.lock] 通知失敗:', e);
      }
    }

    return NextResponse.json({ ok: true, locked, notified });
  } catch (e) {
    return errorResponse(e);
  }
}
