import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireUser } from '@/lib/rbac';
import { deleteFileByKey } from '@/lib/storage';
import { errorResponse } from '@/lib/api';
import { actionEditable } from '@/lib/state-machine';
import type { ActionStatus } from '@/lib/types';
import { writeAuditLog, extractRequestMeta } from '@/lib/audit-log';

/**
 * 刪除佐證檔(誤傳含個資/舊版檔案時自行移除)。
 * 規則:
 * - SUPER_ADMIN 一律可刪
 * - 矯正佐證:該機關 ORG_ADMIN,且週期 REMEDIATION、該項仍可編輯(未送審/退回中)
 * - 準備文件:該機關 ORG_ADMIN,且該項未被委員確認、週期仍在 DRAFT/PREPARATION
 * 連同實體檔一併刪除,並寫稽核軌跡。
 */
export async function DELETE(req: Request, { params }: { params: { id: string } }) {
  try {
    const user = await requireUser();
    const e = await prisma.evidence.findUnique({ where: { id: params.id } });
    if (!e) return NextResponse.json({ error: '檔案不存在' }, { status: 404 });

    if (user.role !== 'SUPER_ADMIN') {
      if (user.role !== 'ORG_ADMIN') {
        return NextResponse.json({ error: '無權刪除佐證' }, { status: 403 });
      }
      if (e.targetType === 'CORRECTIVE_ACTION') {
        const action = await prisma.correctiveAction.findUnique({
          where: { id: e.targetId },
          include: { deficiency: { include: { cycle: true } } },
        });
        if (!action) return NextResponse.json({ error: '對應紀錄不存在' }, { status: 404 });
        const cycle = action.deficiency.cycle;
        if (cycle.organizationId !== user.organizationId) {
          return NextResponse.json({ error: '無權刪除其他機關之佐證' }, { status: 403 });
        }
        if (cycle.status !== 'REMEDIATION' || !actionEditable(action.status as ActionStatus)) {
          return NextResponse.json({ error: '此項目已送審或已通過,佐證不可刪除' }, { status: 400 });
        }
      } else if (e.targetType === 'PREP_SUBMISSION') {
        const sub = await prisma.prepSubmission.findUnique({
          where: { id: e.targetId },
          include: { requirement: { include: { cycle: true } } },
        });
        if (!sub) return NextResponse.json({ error: '對應紀錄不存在' }, { status: 404 });
        const cycle = sub.requirement.cycle;
        if (cycle.organizationId !== user.organizationId) {
          return NextResponse.json({ error: '無權刪除其他機關之文件' }, { status: 403 });
        }
        if (sub.status === 'CONFIRMED' || !(cycle.status === 'DRAFT' || cycle.status === 'PREPARATION')) {
          return NextResponse.json({ error: '已確認齊備或週期已進入後續階段,文件不可刪除' }, { status: 400 });
        }
      } else {
        return NextResponse.json({ error: '此類型佐證不可刪除' }, { status: 400 });
      }
    }

    await prisma.evidence.delete({ where: { id: e.id } });
    await deleteFileByKey(e.storageKey);

    // 準備文件刪到一份不剩時,狀態退回「未上傳」
    if (e.targetType === 'PREP_SUBMISSION') {
      const left = await prisma.evidence.count({
        where: { targetType: 'PREP_SUBMISSION', targetId: e.targetId },
      });
      if (left === 0) {
        await prisma.prepSubmission.update({
          where: { id: e.targetId },
          data: { status: 'EMPTY' },
        });
      }
    }

    const meta = extractRequestMeta(req);
    await writeAuditLog({
      actorId: user.id,
      action: 'EVIDENCE_DELETE',
      entityType: 'Evidence',
      entityId: e.id,
      before: { originalName: e.originalName, targetType: e.targetType, targetId: e.targetId },
      ...meta,
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}
