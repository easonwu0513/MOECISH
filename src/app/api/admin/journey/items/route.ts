import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { requireRole, AuthError } from '@/lib/rbac';
import { errorResponse } from '@/lib/api';
import { writeAuditLog, extractRequestMeta } from '@/lib/audit-log';
import { AUTO_KEY_OPTIONS } from '@/lib/journey-auto';

const AUTO_KEYS = AUTO_KEY_OPTIONS.map((o) => o.key) as [string, ...string[]];

const Body = z.object({
  stageId: z.string().min(1),
  title: z.string().min(1).max(200),
  hint: z.string().max(500).nullable().optional(),
  role: z.enum(['SUPER_ADMIN', 'ORG_ADMIN', 'AUDITOR']).nullable().optional(),
  // 完成判定:autoKey=系統自動(限訊號目錄)、informational=純提醒;皆空=必做・手動勾選
  autoKey: z.enum(AUTO_KEYS).nullable().optional(),
  informational: z.boolean().optional(),
  href: z.string().max(200).nullable().optional(), // 跳轉覆寫(''=週期主頁;null=系統推導)
});

/** 後台：在某階段新增一個項目（接到最後）。 */
export async function POST(req: Request) {
  try {
    const user = await requireRole('SUPER_ADMIN');
    const body = Body.parse(await req.json());

    const stage = await prisma.journeyStage.findUnique({
      where: { id: body.stageId },
      select: { id: true, template: { select: { scope: true } } },
    });
    if (!stage) throw new AuthError(404, '階段不存在');
    // 跨欄位正規化:純提醒不得同時綁訊號(informational 勝出);PROGRAMME 無 autoKey/href 概念,一律清空
    if (body.informational) body.autoKey = null;
    if (stage.template.scope === 'PROGRAMME') { body.autoKey = null; body.href = null; }

    const last = await prisma.journeyItem.findFirst({
      where: { stageId: body.stageId },
      orderBy: { orderIndex: 'desc' },
      select: { orderIndex: true },
    });
    const item = await prisma.journeyItem.create({
      data: {
        stageId: body.stageId,
        title: body.title,
        hint: body.hint ?? null,
        role: body.role ?? null,
        autoKey: body.autoKey ?? null,
        informational: body.informational ?? false,
        href: body.href ?? null,
        orderIndex: (last?.orderIndex ?? -1) + 1,
      },
    });

    await writeAuditLog({
      actorId: user.id, action: 'JOURNEY_ITEM_CREATE', entityType: 'JourneyItem',
      entityId: item.id, after: { title: item.title, role: item.role }, ...extractRequestMeta(req),
    });
    return NextResponse.json({ item });
  } catch (e) {
    return errorResponse(e);
  }
}
