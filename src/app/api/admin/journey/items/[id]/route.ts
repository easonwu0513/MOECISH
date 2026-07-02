import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { requireRole } from '@/lib/rbac';
import { errorResponse } from '@/lib/api';
import { writeAuditLog, extractRequestMeta } from '@/lib/audit-log';
import { AUTO_KEY_OPTIONS } from '@/lib/journey-auto';

const AUTO_KEYS = AUTO_KEY_OPTIONS.map((o) => o.key) as [string, ...string[]];

const Patch = z.object({
  title: z.string().min(1).max(200).optional(),
  hint: z.string().max(500).nullable().optional(),
  role: z.enum(['SUPER_ADMIN', 'ORG_ADMIN', 'AUDITOR']).nullable().optional(),
  orderIndex: z.number().int().optional(),
  autoKey: z.enum(AUTO_KEYS).nullable().optional(),
  informational: z.boolean().optional(),
  href: z.string().max(200).nullable().optional(),
});

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  try {
    const user = await requireRole('SUPER_ADMIN');
    const body = Patch.parse(await req.json());

    // 跨欄位一致性:以「套用後的最終狀態」正規化,避免 autoKey+informational 並存的矛盾態
    const existing = await prisma.journeyItem.findUnique({
      where: { id: params.id },
      select: { autoKey: true, informational: true, stage: { select: { template: { select: { scope: true } } } } },
    });
    if (!existing) return NextResponse.json({ error: '項目不存在' }, { status: 404 });
    const finalInformational = body.informational ?? existing.informational;
    let finalAutoKey = body.autoKey !== undefined ? body.autoKey : existing.autoKey;
    if (finalInformational) finalAutoKey = null;               // 純提醒勝出,不得同時綁訊號
    if (finalAutoKey) body.informational = false;              // 綁訊號則必為系統自動
    if (existing.stage.template.scope === 'PROGRAMME') {       // PROGRAMME 無 autoKey/href 概念
      finalAutoKey = null;
      body.href = body.href !== undefined ? null : undefined;
    }

    const item = await prisma.journeyItem.update({
      where: { id: params.id },
      data: {
        ...(body.title !== undefined ? { title: body.title } : {}),
        ...(body.hint !== undefined ? { hint: body.hint || null } : {}),
        ...(body.role !== undefined ? { role: body.role } : {}),
        ...(body.orderIndex !== undefined ? { orderIndex: body.orderIndex } : {}),
        autoKey: finalAutoKey,
        ...(body.informational !== undefined ? { informational: body.informational } : {}),
        ...(body.href !== undefined ? { href: body.href } : {}),
      },
    });
    await writeAuditLog({
      actorId: user.id, action: 'JOURNEY_ITEM_UPDATE', entityType: 'JourneyItem',
      entityId: item.id, after: { title: item.title, role: item.role }, ...extractRequestMeta(req),
    });
    return NextResponse.json({ item });
  } catch (e) {
    return errorResponse(e);
  }
}

/** 刪除項目（連帶 progress 由 onDelete: Cascade 處理）。 */
export async function DELETE(req: Request, { params }: { params: { id: string } }) {
  try {
    const user = await requireRole('SUPER_ADMIN');
    await prisma.journeyItem.delete({ where: { id: params.id } });
    await writeAuditLog({
      actorId: user.id, action: 'JOURNEY_ITEM_DELETE', entityType: 'JourneyItem',
      entityId: params.id, ...extractRequestMeta(req),
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
