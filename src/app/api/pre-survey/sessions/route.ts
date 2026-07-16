import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { requireRole } from '@/lib/rbac';
import { errorResponse } from '@/lib/api';
import { writeAuditLog, extractRequestMeta } from '@/lib/audit-log';

const Body = z.object({
  year: z.number().int().min(2000).max(2200), // 西元
  name: z.string().trim().min(1, '請填寫場次名稱/地點').max(100),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, '日期格式須為 YYYY-MM-DD').nullable().optional(),
  isRequired: z.boolean().optional(),
  remark: z.string().trim().max(500).optional(),
  targetMemberCount: z.number().int().min(0).max(999).optional(),
  targetObserverCount: z.number().int().min(0).max(999).optional(),
  anonymizeForMember: z.boolean().optional(),
  anonymizeForObserver: z.boolean().optional(),
});

/** 新增年度場次(批A;僅中心 SUPER_ADMIN)。orderIndex 附加於該年度末端,決定受調者看到的匿名序號。 */
export async function POST(req: Request) {
  try {
    const user = await requireRole('SUPER_ADMIN');
    const body = Body.parse(await req.json());

    const last = await prisma.surveySession.findFirst({
      where: { year: body.year },
      orderBy: { orderIndex: 'desc' },
      select: { orderIndex: true },
    });

    const session = await prisma.surveySession.create({
      data: {
        year: body.year,
        name: body.name,
        date: body.date ? new Date(`${body.date}T00:00:00+08:00`) : null,
        isRequired: body.isRequired ?? false,
        remark: body.remark?.trim() || null,
        targetMemberCount: body.targetMemberCount ?? 0,
        targetObserverCount: body.targetObserverCount ?? 0,
        anonymizeForMember: body.anonymizeForMember ?? true,
        anonymizeForObserver: body.anonymizeForObserver ?? true,
        orderIndex: (last?.orderIndex ?? -1) + 1,
        createdById: user.id,
      },
      select: { id: true },
    });

    await writeAuditLog({
      actorId: user.id,
      action: 'SURVEY_SESSION_CREATE',
      entityType: 'SurveySession',
      entityId: session.id,
      after: { year: body.year, name: body.name },
      ...extractRequestMeta(req),
    });

    return NextResponse.json({ session });
  } catch (e) {
    return errorResponse(e);
  }
}
