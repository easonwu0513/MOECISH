import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { requireRole } from '@/lib/rbac';
import { errorResponse } from '@/lib/api';
import { writeAuditLog, extractRequestMeta } from '@/lib/audit-log';
import { SURVEY_PARTICIPANT_KINDS, SURVEY_COMMITTEE_TYPES } from '@/lib/types';

const Body = z.object({
  year: z.number().int().min(2000).max(2200),
  userId: z.string().min(1),
  kind: z.enum(SURVEY_PARTICIPANT_KINDS),
  committeeType: z.enum(SURVEY_COMMITTEE_TYPES).nullable().optional(),
});

/**
 * 加入一位受調人員(批A;僅中心)。人員綁平台帳號:
 *  - MEMBER 須為在職委員(role='AUDITOR' 或有效 AUDITOR 授權);
 *  - OBSERVER 須為在職觀察員(role='OBSERVER' 或有效 OBSERVER 授權)。
 * 多重身分:查授權全集(role ∪ roleGrants endedAt=null),避免現用身分切換後漏查(批51 教訓)。
 * 同年度同帳號唯一(@@unique([year,userId]));重複回 409。
 */
export async function POST(req: Request) {
  try {
    const user = await requireRole('SUPER_ADMIN');
    const body = Body.parse(await req.json());

    const requiredRole = body.kind === 'OBSERVER' ? 'OBSERVER' : 'AUDITOR';
    const account = await prisma.user.findUnique({
      where: { id: body.userId },
      include: { roleGrants: { where: { endedAt: null } } },
    });
    if (!account || !account.isActive) {
      return NextResponse.json({ error: '帳號不存在或已停用' }, { status: 400 });
    }
    const holdsRole =
      account.role === requiredRole || account.roleGrants.some((g) => g.role === requiredRole);
    if (!holdsRole) {
      const label = body.kind === 'OBSERVER' ? '觀察員' : '委員';
      return NextResponse.json({ error: `此帳號不具${label}身分，無法加入為受調${label}` }, { status: 400 });
    }

    try {
      const participant = await prisma.surveyParticipant.create({
        data: {
          year: body.year,
          userId: body.userId,
          kind: body.kind,
          committeeType: body.kind === 'MEMBER' ? body.committeeType ?? null : null,
          invitedById: user.id,
        },
        select: { id: true },
      });

      await writeAuditLog({
        actorId: user.id,
        action: 'SURVEY_PARTICIPANT_ADD',
        entityType: 'SurveyParticipant',
        entityId: participant.id,
        after: { year: body.year, userId: body.userId, kind: body.kind },
        ...extractRequestMeta(req),
      });

      return NextResponse.json({ participant });
    } catch (e) {
      // @@unique([year, userId]) 撞鍵
      if ((e as { code?: string }).code === 'P2002') {
        return NextResponse.json({ error: '此帳號已在本年度受調名單中' }, { status: 409 });
      }
      throw e;
    }
  } catch (e) {
    return errorResponse(e);
  }
}
