import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireRole } from '@/lib/rbac';
import { errorResponse } from '@/lib/api';
import { writeAuditLog, extractRequestMeta } from '@/lib/audit-log';

/**
 * 晉升觀察員→稽核委員(批32;SUPER_ADMIN 專用):
 * - 結束所有有效 OBSERVER 授權(endedAt 蓋章留歷史)
 * - 確保 AUDITOR 授權存在(不重複建)
 * - 現用身分若為 OBSERVER → 同步切為 AUDITOR(下一請求 session 即生效)
 * - 實習紀錄(PracticeFinding/Feedback)原樣留存:同 userId 天然銜接,不轉換、不刪除、
 *   不混入正式發現(獨立資料表,結構性隔離);本人與中心可於實習紀錄頁回顧。
 */
export async function POST(req: Request, { params }: { params: { id: string } }) {
  try {
    const admin = await requireRole('SUPER_ADMIN');

    const target = await prisma.user.findUnique({
      where: { id: params.id },
      include: { roleGrants: { where: { endedAt: null } } },
    });
    if (!target || !target.isActive) {
      return NextResponse.json({ error: '帳號不存在或已停用' }, { status: 404 });
    }
    const holdsObserver =
      target.role === 'OBSERVER' || target.roleGrants.some((g) => g.role === 'OBSERVER');
    if (!holdsObserver) {
      return NextResponse.json({ error: '此帳號未持有觀察員身分，無需晉升' }, { status: 400 });
    }

    const now = new Date();
    const hasAuditorGrant = target.roleGrants.some((g) => g.role === 'AUDITOR');

    await prisma.$transaction(async (tx) => {
      // 結束 OBSERVER 授權(留歷史)
      await tx.userRole.updateMany({
        where: { userId: target.id, role: 'OBSERVER', endedAt: null },
        data: { endedAt: now },
      });
      // 確保 AUDITOR 授權存在(無授權表列的 legacy 觀察員亦補列,晉升軌跡可追)
      if (!hasAuditorGrant) {
        await tx.userRole.create({
          data: { userId: target.id, role: 'AUDITOR', organizationId: null, createdById: admin.id },
        });
      }
      // 現用身分為觀察員 → 切為委員(騎乘 jwt 每請求回查,即時生效)
      if (target.role === 'OBSERVER') {
        await tx.user.update({
          where: { id: target.id },
          data: { role: 'AUDITOR', organizationId: null },
        });
      }
    });

    await writeAuditLog({
      actorId: admin.id,
      action: 'OBSERVER_PROMOTE',
      entityType: 'User',
      entityId: target.id,
      before: { role: target.role },
      after: { role: 'AUDITOR', note: '觀察員晉升為稽核委員；實習紀錄留存' },
      ...extractRequestMeta(req),
    });

    // 站內通知被晉升者:身分/可見範圍變更(晉升結果不因通知失敗而回滾)
    try {
      await prisma.notification.create({
        data: {
          userId: target.id,
          kind: 'observer-promote',
          title: '已晉升為稽核委員',
          body: '中心已將您的觀察員身分晉升為稽核委員。您現在可受指派實地稽核週期，並檢視全體委員的稽核發現；先前的練習紀錄仍留存供回顧。',
          link: '/dashboard',
        },
      });
    } catch (e) {
      console.error('notify observer promote failed:', e);
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
