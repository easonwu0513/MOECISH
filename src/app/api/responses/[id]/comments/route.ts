import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { requireRole } from '@/lib/rbac';
import { writeAuditLog, extractRequestMeta } from '@/lib/audit-log';
import { errorResponse } from '@/lib/api';

const Body = z.object({ content: z.string().min(1) });

export async function POST(req: Request, { params }: { params: { id: string } }) {
  try {
    const user = await requireRole('AUDITOR', 'SUPER_ADMIN');
    const body = Body.parse(await req.json());

    const response = await prisma.checklistResponse.findUnique({
      where: { id: params.id },
      include: {
        comments: { orderBy: { round: 'desc' }, take: 1 },
        cycle: { include: { assignments: true } },
      },
    });
    if (!response) return NextResponse.json({ error: 'response 不存在' }, { status: 404 });

    // 租戶/指派檢查:委員僅能對被指派週期留言(杜絕跨機關寫入官方意見)
    if (
      user.role === 'AUDITOR' &&
      !response.cycle.assignments.some((a) => a.auditorId === user.id)
    ) {
      return NextResponse.json({ error: '您未被指派此稽核週期' }, { status: 403 });
    }

    const nextRound = (response.comments[0]?.round ?? 0) + 1;
    const created = await prisma.auditorComment.create({
      data: {
        responseId: response.id,
        auditorId: user.id,
        content: body.content,
        round: nextRound,
      },
    });

    // 2.0:檢核表為選用模組,委員意見不再驅動週期狀態轉換

    const meta = extractRequestMeta(req);
    await writeAuditLog({
      actorId: user.id,
      action: 'AUDITOR_COMMENT_CREATE',
      entityType: 'AuditorComment',
      entityId: created.id,
      after: created,
      ...meta,
    });

    return NextResponse.json(created);
  } catch (e) {
    return errorResponse(e);
  }
}
