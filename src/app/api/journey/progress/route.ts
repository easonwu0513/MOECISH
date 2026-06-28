import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { requireUser, AuthError } from '@/lib/rbac';
import { errorResponse } from '@/lib/api';
import { writeAuditLog, extractRequestMeta } from '@/lib/audit-log';
import { canToggleJourneyItem } from '@/lib/journey';
import type { JourneyScope } from '@/lib/types';

const Body = z.object({
  itemId: z.string().min(1),
  scope: z.enum(['CYCLE', 'PROGRAMME']),
  cycleId: z.string().optional(),
  programmeYear: z.number().int().min(101).max(199).optional(), // 一律民國年 ROC,與 /journey 頁一致

  done: z.boolean(),
  note: z.string().max(500).optional(),
});

/**
 * 勾選 / 取消勾選一個精靈項目（存進 JourneyProgress）。
 * 授權：
 *  - scope 以「項目所屬範本實際 scope」為準（不信任前端傳來的 scope）。
 *  - CYCLE：先 assertCycleAccess(cycleId) 防跨機關 IDOR，再 canToggleJourneyItem 限角色。
 *  - PROGRAMME：限最高管理員。
 */
export async function POST(req: Request) {
  try {
    const user = await requireUser();
    const body = Body.parse(await req.json());

    const item = await prisma.journeyItem.findUnique({
      where: { id: body.itemId },
      include: { stage: { include: { template: true } } },
    });
    if (!item) throw new AuthError(404, '精靈項目不存在');

    const scope = item.stage.template.scope as JourneyScope; // 以實際 scope 為準
    if (scope !== body.scope) throw new AuthError(400, 'scope 與項目不符');
    // 週期精靈改為依系統實況自動判定,不接受手動勾選。
    if (scope === 'CYCLE') throw new AuthError(400, '週期精靈依系統進度自動更新,無法手動勾選');
    if (!canToggleJourneyItem(user.role, scope, item.role)) {
      throw new AuthError(403, '此項目非您可勾選');
    }

    const fields = {
      done: body.done,
      doneAt: body.done ? new Date() : null,
      doneById: body.done ? user.id : null,
      doneByName: body.done ? user.name : null,
      ...(body.note !== undefined ? { note: body.note || null } : {}),
    };

    // 此處 scope 必為 PROGRAMME（CYCLE 已於上方擋下,改為系統自動判定)。
    if (body.programmeYear == null) throw new AuthError(400, '缺少 programmeYear');
    const progress = await prisma.journeyProgress.upsert({
      where: { itemId_programmeYear: { itemId: item.id, programmeYear: body.programmeYear } },
      create: { itemId: item.id, programmeYear: body.programmeYear, ...fields },
      update: fields,
    });

    await writeAuditLog({
      actorId: user.id,
      action: body.done ? 'JOURNEY_ITEM_DONE' : 'JOURNEY_ITEM_UNDONE',
      entityType: 'JourneyProgress',
      entityId: progress.id,
      after: {
        scope,
        itemId: item.id,
        cycleId: body.cycleId ?? null,
        programmeYear: body.programmeYear ?? null,
        done: body.done,
      },
      ...extractRequestMeta(req),
    });

    return NextResponse.json({
      progress: {
        done: progress.done,
        doneAt: progress.doneAt,
        doneByName: progress.doneByName,
        note: progress.note,
      },
    });
  } catch (e) {
    return errorResponse(e);
  }
}
