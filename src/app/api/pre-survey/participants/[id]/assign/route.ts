import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { requireRole } from '@/lib/rbac';
import { errorResponse } from '@/lib/api';
import { writeAuditLog, extractRequestMeta } from '@/lib/audit-log';

const Body = z.object({
  sessionIds: z.array(z.string().min(1)).max(50),
});

/**
 * 指派某受調人員的「最終場次」(批A;僅中心)。以整組覆寫 SurveyFinalAssignment:
 * 傳入集合外的既有指派刪除、集合內新的建立。指派 ≥1 場即解鎖該人二階(差旅/飲食,批B)。
 * 場次須同年度(防跨年度誤指派)。
 */
export async function PUT(req: Request, { params }: { params: { id: string } }) {
  try {
    const user = await requireRole('SUPER_ADMIN');
    const body = Body.parse(await req.json());

    const participant = await prisma.surveyParticipant.findUnique({
      where: { id: params.id },
      select: { id: true, year: true, kind: true },
    });
    if (!participant) return NextResponse.json({ error: '受調人員不存在' }, { status: 404 });

    const wanted = Array.from(new Set(body.sessionIds));
    if (wanted.length > 0) {
      // D 防禦縱深:觀察員不得被指派到「委員專屬」場次(sharedWithObserver=false),與自助頁/達標卡排除一致。
      const where =
        participant.kind === 'OBSERVER'
          ? { id: { in: wanted }, year: participant.year, sharedWithObserver: true }
          : { id: { in: wanted }, year: participant.year };
      const valid = await prisma.surveySession.count({ where });
      if (valid !== wanted.length) {
        return NextResponse.json(
          {
            error:
              participant.kind === 'OBSERVER'
                ? '含不存在、非此年度、或委員專屬（不開放觀察員）的場次'
                : '含不存在或非此年度的場次',
          },
          { status: 400 },
        );
      }
    }

    await prisma.$transaction(async (tx) => {
      await tx.surveyFinalAssignment.deleteMany({
        where: { participantId: participant.id, sessionId: { notIn: wanted.length ? wanted : ['__none__'] } },
      });
      const existing = await tx.surveyFinalAssignment.findMany({
        where: { participantId: participant.id },
        select: { sessionId: true },
      });
      const have = new Set(existing.map((a) => a.sessionId));
      const toAdd = wanted.filter((sid) => !have.has(sid));
      if (toAdd.length > 0) {
        // skipDuplicates:並發相同指派冪等,不撞 @@unique 觸發偽 409(@@unique 仍保證不產生重複指派列)
        await tx.surveyFinalAssignment.createMany({
          data: toAdd.map((sid) => ({ participantId: participant.id, sessionId: sid, assignedById: user.id })),
          skipDuplicates: true,
        });
      }
    });

    await writeAuditLog({
      actorId: user.id,
      action: 'SURVEY_FINAL_ASSIGN',
      entityType: 'SurveyParticipant',
      entityId: participant.id,
      after: { sessionIds: wanted },
      ...extractRequestMeta(req),
    });

    return NextResponse.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
