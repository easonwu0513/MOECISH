import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { requireRole } from '@/lib/rbac';
import { writeAuditLog, extractRequestMeta } from '@/lib/audit-log';
import { errorResponse } from '@/lib/api';
import { auditorCanViewChecklistContent, auditorReviewWindowOpen } from '@/lib/types';

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
    // 委員於「資料齊備」前不可留意見(資料準備中不開放委員審閱)
    if (user.role === 'AUDITOR' && !auditorCanViewChecklistContent(response.cycle.status)) {
      return NextResponse.json({ error: '資料準備階段尚未開放委員審閱留言' }, { status: 403 });
    }
    // 審閱時間區間閘(UAT 批67):不在窗口內(或未設)→ 委員不可審閱留言
    if (user.role === 'AUDITOR' && !auditorReviewWindowOpen(response.cycle.reviewWindowStart, response.cycle.reviewWindowEnd)) {
      return NextResponse.json({ error: '目前不在委員審閱時間區間內，暫不開放審閱' }, { status: 403 });
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
