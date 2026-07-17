import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireRole } from '@/lib/rbac';
import { errorResponse } from '@/lib/api';
import { writeAuditLog, extractRequestMeta } from '@/lib/audit-log';

/**
 * 刪除稽核週期(UAT 圖11;僅中心 SUPER_ADMIN、僅「開立中(DRAFT)」可刪)。
 * DRAFT=尚未通知機關、無業務資料的誤開立清理;一旦進入 PREPARATION 之後即不可刪(留軌跡)。
 * 子表(檢核回應/資料準備需求/指派/精靈進度…)由 schema onDelete: Cascade 一併清除;
 * 防禦:若已有持續列管拋轉(originCycleId 參照,理論上 DRAFT 不可能)則拒刪。
 */
export async function DELETE(req: Request, { params }: { params: { id: string } }) {
  try {
    const user = await requireRole('SUPER_ADMIN');

    const cycle = await prisma.auditCycle.findUnique({
      where: { id: params.id },
      include: { organization: { select: { name: true } } },
    });
    if (!cycle) return NextResponse.json({ error: '週期不存在' }, { status: 404 });
    if (cycle.status !== 'DRAFT') {
      return NextResponse.json({ error: '僅「開立中」的週期可刪除；已進入後續階段的週期請走正常流程結案。' }, { status: 400 });
    }
    const trackedCount = await prisma.trackedDeficiency.count({ where: { originCycleId: cycle.id } });
    if (trackedCount > 0) {
      return NextResponse.json({ error: '此週期已有持續列管拋轉紀錄，不可刪除。' }, { status: 400 });
    }

    await prisma.auditCycle.delete({ where: { id: cycle.id } });

    await writeAuditLog({
      actorId: user.id,
      action: 'CYCLE_DELETE',
      entityType: 'AuditCycle',
      entityId: cycle.id,
      after: { organization: cycle.organization.name, year: cycle.year, status: cycle.status },
      ...extractRequestMeta(req),
    });

    return NextResponse.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
