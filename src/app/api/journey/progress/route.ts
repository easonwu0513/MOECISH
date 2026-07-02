import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { requireUser, assertCycleAccess, AuthError } from '@/lib/rbac';
import { errorResponse } from '@/lib/api';
import { writeAuditLog, extractRequestMeta } from '@/lib/audit-log';
import { canToggleJourneyItem } from '@/lib/journey';
import { cycleStageReached } from '@/lib/journey-auto';
import type { JourneyScope, CycleStatus } from '@/lib/types';

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
    // 系統自動項(autoKey)與純提醒項不接受手動勾選(CYCLE/PROGRAMME 皆同,避免 UI 隱藏但 API 可寫的幽靈進度);
    // 「必做・手動勾選」項(無 autoKey 且非純提醒,由編輯器設定)開放手動勾選。
    if (item.autoKey != null || item.informational) {
      throw new AuthError(400, '此項目由系統自動判定或為純提醒,無法手動勾選');
    }
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

    let progress;
    if (scope === 'CYCLE') {
      // 防跨機關 IDOR:cycleId 必填且須為登入者可存取之週期(assertCycleAccess 內含角色/租戶檢核)
      if (!body.cycleId) throw new AuthError(400, '缺少 cycleId');
      const { cycle } = await assertCycleAccess(body.cycleId);
      // 未到達的階段不可先勾(與週期頁「尚未開放」鎖定一致;避免 ?stage=all 檢視時預勾未來任務)
      if (!cycleStageReached(item.stage.stageKey, cycle.status as CycleStatus)) {
        throw new AuthError(400, '該階段尚未開始,無法勾選');
      }
      progress = await prisma.journeyProgress.upsert({
        where: { itemId_cycleId: { itemId: item.id, cycleId: body.cycleId } },
        create: { itemId: item.id, cycleId: body.cycleId, ...fields },
        update: fields,
      });
    } else {
      if (body.programmeYear == null) throw new AuthError(400, '缺少 programmeYear');
      progress = await prisma.journeyProgress.upsert({
        where: { itemId_programmeYear: { itemId: item.id, programmeYear: body.programmeYear } },
        create: { itemId: item.id, programmeYear: body.programmeYear, ...fields },
        update: fields,
      });
    }

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
