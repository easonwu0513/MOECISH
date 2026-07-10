import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { requireRole } from '@/lib/rbac';
import { writeAuditLog, extractRequestMeta } from '@/lib/audit-log';
import { errorResponse } from '@/lib/api';
import { auditorCanViewChecklistContent, reviewWindowOpenForRole } from '@/lib/types';

const Body = z.object({ content: z.string().trim().min(1).max(5000) });

/**
 * 觀察員意見(批42):檢核表逐題「練習意見」,比照委員意見的操作但存獨立 PracticeComment 表——
 * 僅觀察員本人/其指導者/中心可見;機關與委員完全不可見(機關補正回應等下游只掛 AuditorComment,無耦合)。
 * 閘與委員意見對稱:須配對本週期 + 資料齊備後 + 觀察員審閱窗口內。
 */
export async function POST(req: Request, { params }: { params: { id: string } }) {
  try {
    const user = await requireRole('OBSERVER');
    const body = Body.parse(await req.json());

    const response = await prisma.checklistResponse.findUnique({
      where: { id: params.id },
      include: { cycle: { select: { id: true, status: true, reviewWindowStart: true, reviewWindowEnd: true, observerWindowStart: true, observerWindowEnd: true } } },
    });
    if (!response) return NextResponse.json({ error: 'response 不存在' }, { status: 404 });

    // 配對檢查:觀察員僅能對「被配對之週期」留練習意見(杜絕跨機關寫入)
    const paired = await prisma.cycleObserver.findUnique({
      where: { cycleId_observerId: { cycleId: response.cycle.id, observerId: user.id } },
      select: { id: true },
    });
    if (!paired) return NextResponse.json({ error: '您未被配對至此稽核週期' }, { status: 403 });
    // 資料齊備前不開放審閱(與觀察員檢核表審閱頁同閘)
    if (!auditorCanViewChecklistContent(response.cycle.status)) {
      return NextResponse.json({ error: '資料準備階段尚未開放審閱留言' }, { status: 403 });
    }
    // 觀察員獨立審閱窗口(批30):不在窗口內(或未設)→ 不可留意見
    if (!reviewWindowOpenForRole('OBSERVER', response.cycle)) {
      return NextResponse.json({ error: '目前不在觀察員審閱時段內，暫不開放留言' }, { status: 403 });
    }

    const created = await prisma.practiceComment.create({
      data: { responseId: response.id, observerId: user.id, content: body.content },
    });

    await writeAuditLog({
      actorId: user.id,
      action: 'PRACTICE_COMMENT_CREATE',
      entityType: 'PracticeComment',
      entityId: created.id,
      after: { responseId: response.id },
      ...extractRequestMeta(req),
    });

    return NextResponse.json(created);
  } catch (e) {
    return errorResponse(e);
  }
}
