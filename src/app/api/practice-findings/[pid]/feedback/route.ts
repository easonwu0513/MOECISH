import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { requireRole } from '@/lib/rbac';
import { canAccess } from '@/lib/access-policy';
import { errorResponse } from '@/lib/api';
import { writeAuditLog, extractRequestMeta } from '@/lib/audit-log';

const Body = z.object({ content: z.string().trim().min(1).max(5000) });

/**
 * 指導委員對單條練習發現給回饋(批30 師徒制)。
 * 授權:僅「該觀察員在該週期的指導委員」(CycleObserver.mentorId)可回饋——非其 mentor 的
 * 委員一律 403(與「委員意見僅見己見」同隔離哲學);中心唯讀不回饋、機關不可見。
 * 階段:結案(CLOSED)後鎖定;其餘階段皆可(觀摩後的回饋常在實地稽核後補寫)。
 */
export async function POST(req: Request, { params }: { params: { pid: string } }) {
  try {
    const user = await requireRole('AUDITOR');
    const body = Body.parse(await req.json());

    const pf = await prisma.practiceFinding.findUnique({
      where: { id: params.pid },
      include: { cycle: { select: { id: true, status: true } } },
    });
    if (!pf) return NextResponse.json({ error: '練習發現不存在' }, { status: 404 });
    // 階段閘與練習撰寫對稱(ONSITE..REMEDIATION;CLOSED 鎖定)——避免週期回退至 ONSITE 前仍可回饋
    // (批30 對抗審查 P2:原僅擋 CLOSED,回退後 pre-ONSITE 仍可寫)。
    if (!canAccess('practice.access', 'OBSERVER', pf.cycle.status)) {
      return NextResponse.json({ error: '目前非練習開放階段,回饋已鎖定' }, { status: 409 });
    }

    const pairing = await prisma.cycleObserver.findUnique({
      where: { cycleId_observerId: { cycleId: pf.cycle.id, observerId: pf.observerId } },
      select: { mentorId: true },
    });
    if (!pairing || pairing.mentorId !== user.id) {
      return NextResponse.json({ error: '僅該觀察員的指導委員可給予回饋' }, { status: 403 });
    }

    const created = await prisma.practiceFeedback.create({
      data: { practiceFindingId: pf.id, mentorId: user.id, content: body.content },
      include: { mentor: { select: { id: true, name: true } } },
    });

    await writeAuditLog({
      actorId: user.id,
      action: 'PRACTICE_FEEDBACK_CREATE',
      entityType: 'PracticeFeedback',
      entityId: created.id,
      after: { practiceFindingId: pf.id },
      ...extractRequestMeta(req),
    });

    return NextResponse.json(created);
  } catch (e) {
    return errorResponse(e);
  }
}
