import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { assertPracticeAccess, assertPracticeUnlocked } from '@/lib/rbac';
import { errorResponse } from '@/lib/api';
import { DEFICIENCY_ASPECTS } from '@/lib/types';
import { canAccess } from '@/lib/access-policy';
import { FINDING_KINDS } from '@/lib/audit-score';
import { toFullWidthPunct } from '@/lib/fullwidth-punct';
import { writeAuditLog, extractRequestMeta } from '@/lib/audit-log';

/**
 * 稽核發現撰寫練習(批30 師徒制):練習資料存獨立 PracticeFinding 表——結構性保證
 * 絕不進入彙整工具/正式報告/缺失管考(該些消費端只讀 AuditFinding)。
 * 可見範圍由 assertPracticeAccess 單一決定:觀察員=own / 指導委員=自己帶的 / 中心=全部 / 機關=403。
 */
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  try {
    const { cycle, viewerKind, observerIds } = await assertPracticeAccess(params.id);
    if (observerIds.length === 0) return NextResponse.json({ items: [], viewerKind });

    const items = await prisma.practiceFinding.findMany({
      where: { cycleId: cycle.id, observerId: { in: observerIds } },
      include: {
        observer: { select: { id: true, name: true } },
        feedbacks: {
          orderBy: { createdAt: 'asc' },
          include: { mentor: { select: { id: true, name: true } } },
        },
      },
      orderBy: { createdAt: 'asc' },
    });
    return NextResponse.json({ items, viewerKind });
  } catch (e) {
    return errorResponse(e);
  }
}

const CreateBody = z.object({
  aspect: z.enum(DEFICIENCY_ASPECTS),
  kind: z.enum(FINDING_KINDS),
  content: z.string().trim().min(5, '練習內容至少 5 字'),
  checklistRef: z.string().trim().max(50).optional(),
});

/** 觀察員新增一條練習發現(僅本人;階段閘比照委員評分 ONSITE 起、結案鎖定)。 */
export async function POST(req: Request, { params }: { params: { id: string } }) {
  try {
    const { user, cycle } = await assertPracticeAccess(params.id);
    if (user.role === 'OBSERVER') await assertPracticeUnlocked(cycle.id, user.id); // 送出鎖定後不可再新增(批45)
    if (user.role !== 'OBSERVER') {
      return NextResponse.json({ error: '僅觀察員本人可撰寫練習發現' }, { status: 403 });
    }
    if (!canAccess('practice.access', 'OBSERVER', cycle.status)) {
      return NextResponse.json({ error: '練習於實地稽核階段開放(結案後鎖定)' }, { status: 403 });
    }
    const body = CreateBody.parse(await req.json());

    const created = await prisma.practiceFinding.create({
      data: {
        cycleId: cycle.id,
        observerId: user.id,
        aspect: body.aspect,
        kind: body.kind,
        content: toFullWidthPunct(body.content),
        checklistRef: body.checklistRef || null,
      },
    });

    await writeAuditLog({
      actorId: user.id,
      action: 'PRACTICE_FINDING_CREATE',
      entityType: 'PracticeFinding',
      entityId: created.id,
      after: { cycleId: cycle.id, aspect: created.aspect, kind: created.kind },
      ...extractRequestMeta(req),
    });

    return NextResponse.json(created);
  } catch (e) {
    return errorResponse(e);
  }
}
