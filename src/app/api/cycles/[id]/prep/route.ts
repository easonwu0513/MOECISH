import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { assertCycleAccess } from '@/lib/rbac';
import { errorResponse } from '@/lib/api';
import { writeAuditLog, extractRequestMeta } from '@/lib/audit-log';

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  try {
    await assertCycleAccess(params.id);
    const items = await prisma.prepRequirement.findMany({
      where: { cycleId: params.id },
      include: { submission: true },
      orderBy: { orderIndex: 'asc' },
    });
    // 帶出每個 submission 的佐證檔
    const subIds = items.map((i) => i.submission?.id).filter(Boolean) as string[];
    const files = subIds.length
      ? await prisma.evidence.findMany({
          where: { targetType: 'PREP_SUBMISSION', targetId: { in: subIds } },
          select: { id: true, targetId: true, originalName: true, sizeBytes: true, uploadedAt: true },
          orderBy: { uploadedAt: 'asc' },
        })
      : [];
    return NextResponse.json({ items, files });
  } catch (e) {
    return errorResponse(e);
  }
}

const CreateBody = z.object({
  title: z.string().min(2),
  description: z.string().optional(),
  required: z.boolean().optional(),
});

import { STANDARD_PREP_ITEMS as STANDARD_ITEMS } from '@/lib/prep-standard';

export async function POST(req: Request, { params }: { params: { id: string } }) {
  try {
    const { user, cycle } = await assertCycleAccess(params.id);
    if (user.role !== 'SUPER_ADMIN') {
      return NextResponse.json({ error: '僅最高管理員可設定需求清單' }, { status: 403 });
    }
    if (cycle.status === 'CLOSED') {
      return NextResponse.json({ error: '已結案不可調整' }, { status: 400 });
    }

    const url = new URL(req.url);
    const meta = extractRequestMeta(req);

    // ?standard=1 → 一鍵套用標準清單
    if (url.searchParams.get('standard') === '1') {
      const existing = await prisma.prepRequirement.count({ where: { cycleId: cycle.id } });
      let order = existing;
      let created = 0;
      for (const item of STANDARD_ITEMS) {
        const dup = await prisma.prepRequirement.findFirst({
          where: { cycleId: cycle.id, title: item.title },
        });
        if (dup) continue;
        await prisma.prepRequirement.create({
          data: {
            cycleId: cycle.id,
            title: item.title,
            description: item.description,
            orderIndex: order++,
            submission: { create: {} },
          },
        });
        created++;
      }
      await writeAuditLog({
        actorId: user.id, action: 'PREP_STANDARD_APPLY', entityType: 'AuditCycle',
        entityId: cycle.id, after: { created }, ...meta,
      });
      return NextResponse.json({ created });
    }

    const body = CreateBody.parse(await req.json());
    const max = await prisma.prepRequirement.aggregate({
      where: { cycleId: cycle.id },
      _max: { orderIndex: true },
    });
    const item = await prisma.prepRequirement.create({
      data: {
        cycleId: cycle.id,
        title: body.title,
        description: body.description || null,
        required: body.required ?? true,
        orderIndex: (max._max.orderIndex ?? -1) + 1,
        submission: { create: {} },
      },
      include: { submission: true },
    });

    await writeAuditLog({
      actorId: user.id, action: 'PREP_REQUIREMENT_CREATE', entityType: 'PrepRequirement',
      entityId: item.id, after: { title: item.title }, ...meta,
    });

    return NextResponse.json({ item });
  } catch (e) {
    return errorResponse(e);
  }
}
