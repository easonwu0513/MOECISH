import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { requireRole, AuthError } from '@/lib/rbac';
import { writeAuditLog, extractRequestMeta } from '@/lib/audit-log';

const Body = z.object({ content: z.string().min(1) });

export async function POST(req: Request, { params }: { params: { id: string } }) {
  try {
    const user = await requireRole('AUDITOR', 'ADMIN');
    const body = Body.parse(await req.json());

    const response = await prisma.checklistResponse.findUnique({
      where: { id: params.id },
      include: { comments: { orderBy: { round: 'desc' }, take: 1 } },
    });
    if (!response) return NextResponse.json({ error: 'response 不存在' }, { status: 404 });

    const nextRound = (response.comments[0]?.round ?? 0) + 1;
    const created = await prisma.auditorComment.create({
      data: {
        responseId: response.id,
        auditorId: user.id,
        content: body.content,
        round: nextRound,
      },
    });

    // Bump cycle to COMMENTS_RETURNED if currently IN_REVIEW
    const cycle = await prisma.auditCycle.findUnique({ where: { id: response.cycleId } });
    if (cycle && cycle.status === 'IN_REVIEW') {
      await prisma.auditCycle.update({
        where: { id: cycle.id },
        data: {
          status: 'COMMENTS_RETURNED',
          stateTransitions: {
            create: { fromStatus: 'IN_REVIEW', toStatus: 'COMMENTS_RETURNED', actorId: user.id },
          },
        },
      });
    }

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
    if (e instanceof AuthError) return NextResponse.json({ error: e.message }, { status: e.status });
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}
