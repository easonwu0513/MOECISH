import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { requireRole } from '@/lib/rbac';
import { errorResponse } from '@/lib/api';
import { writeAuditLog, extractRequestMeta } from '@/lib/audit-log';
import { assertSurveyYearWritable } from '@/lib/pre-survey-server';

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
  sharedWithObserver: z.boolean().optional(),
  // UAT 圖14:是否需要第二階段差旅(線上會議設 false);isBriefing=受稽機關說明會(年度必備,不可刪)
  needsTravel: z.boolean().optional(),
  isBriefing: z.boolean().optional(),
});

/** 新增年度場次(批A;僅中心 SUPER_ADMIN)。orderIndex 附加於該年度末端,決定受調者看到的匿名序號。 */
export async function POST(req: Request) {
  try {
    const user = await requireRole('SUPER_ADMIN');
    const body = Body.parse(await req.json());
    assertSurveyYearWritable(body.year); // UAT 圖57:歷年資料唯讀

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
        anonymizeForMember: body.anonymizeForMember ?? true,
        // P1:非共同場次(委員專屬)無觀察員可參加——目標觀察員數強制 0,
        // 否則達標卡顯示「觀察員 0/N 未達標」卻永遠補不滿(假警示)。
        anonymizeForObserver: body.anonymizeForObserver ?? true,
        sharedWithObserver: body.sharedWithObserver ?? true,
        targetObserverCount: body.sharedWithObserver === false ? 0 : body.targetObserverCount ?? 0,
        needsTravel: body.needsTravel ?? true,
        isBriefing: body.isBriefing ?? false,
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
