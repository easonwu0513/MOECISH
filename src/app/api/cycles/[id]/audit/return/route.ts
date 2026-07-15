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
        { error: '實地稽核階段已結束，委員評分已定稿凍結，不可退件。如確需修正，請先將週期回退至「實地稽核」後處理（重大操作，請審慎）' },
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
      return NextResponse.json({ error: '該委員尚未確認填寫完畢，無需退件' }, { status: 409 });
    }

    // 退件解鎖:悲觀鎖 aggregate root(AuditCycle FOR UPDATE)+ 交易內重查凍結閘(REPORT_ISSUED 起不可退件)與定稿狀態,
    // 與中心「完成稽核 / 推進至 REPORT_ISSUED」互斥——消除「讀到可退件、推進途中本委員被退件」的 TOCTOU(對手方 finish/
    // transition 對稱鎖同列)。⚠️外層 canAssignAuditors(cycle.status) 前置檢查為交易外讀,推進可插在檢查與此裸寫之間。
    const returned = await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "AuditCycle" WHERE id = ${cycle.id} FOR UPDATE`;
      const fresh = await tx.auditCycle.findUnique({ where: { id: cycle.id }, select: { status: true } });
      if (!fresh || !canAssignAuditors(fresh.status as CycleStatus)) return false; // 已進入缺失發布/凍結 → 不可退件
      const a = await tx.auditorAssignment.findUnique({ where: { id: assignment.id }, select: { scoreLockedAt: true } });
      if (!a?.scoreLockedAt) return false; // 已被其他退件/解鎖清空
      await tx.auditorAssignment.update({ where: { id: assignment.id }, data: { scoreLockedAt: null } });
      return true;
      // 提高 timeout(預設 5s):此交易持 AuditCycle 列鎖,可能排隊等中心 finish 的長臨界區(逐筆轉缺失),防等鎖期間 P2028。
    }, { timeout: 30000, maxWait: 10000 });
    if (!returned) {
      return NextResponse.json(
        { error: '週期階段已變更或該委員已非定稿狀態，請重新整理後再試。' },
        { status: 409 },
      );
    }

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
      console.error('[audit.return] 通知失敗：', e);
    }

    return NextResponse.json({ ok: true, notified });
  } catch (e) {
    return errorResponse(e);
  }
}
