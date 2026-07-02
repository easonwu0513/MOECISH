import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { requireRole } from '@/lib/rbac';
import { errorResponse } from '@/lib/api';
import { writeAuditLog, extractRequestMeta } from '@/lib/audit-log';

// 日期字串(yyyy-mm-dd 或 ISO;null=清除)。開始/截止供 PROGRAMME 年度 SOP 排程,CYCLE 不使用(編輯器不顯示)
const DateStr = z.string().refine((v) => !Number.isNaN(Date.parse(v)), '日期格式不正確').nullable().optional();

const Body = z.object({
  scope: z.enum(['CYCLE', 'PROGRAMME']),
  stageKey: z.string().min(1).max(40),
  title: z.string().min(1).max(100),
  summary: z.string().max(300).nullable().optional(),
  startDate: DateStr,
  dueDate: DateStr,
});

/** 後台：新增一個精靈階段（接到該 scope 範本最後）。 */
export async function POST(req: Request) {
  try {
    const user = await requireRole('SUPER_ADMIN');
    const body = Body.parse(await req.json());

    // 範本以 scope 唯一；不存在則建立（標題用預設，可後台改）。
    const template = await prisma.journeyTemplate.upsert({
      where: { scope: body.scope },
      create: { scope: body.scope, title: body.scope === 'CYCLE' ? '週期各階段精靈' : '中心年度計畫執行精靈' },
      update: {},
    });

    const last = await prisma.journeyStage.findFirst({
      where: { templateId: template.id },
      orderBy: { orderIndex: 'desc' },
      select: { orderIndex: true },
    });
    const stage = await prisma.journeyStage.create({
      data: {
        templateId: template.id,
        stageKey: body.stageKey,
        title: body.title,
        summary: body.summary ?? null,
        startDate: body.startDate ? new Date(body.startDate) : null,
        dueDate: body.dueDate ? new Date(body.dueDate) : null,
        orderIndex: (last?.orderIndex ?? -1) + 1,
      },
    });

    await writeAuditLog({
      actorId: user.id, action: 'JOURNEY_STAGE_CREATE', entityType: 'JourneyStage',
      entityId: stage.id, after: { scope: body.scope, title: stage.title }, ...extractRequestMeta(req),
    });
    return NextResponse.json({ stage });
  } catch (e) {
    return errorResponse(e);
  }
}
