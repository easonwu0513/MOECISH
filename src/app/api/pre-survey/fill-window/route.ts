import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { requireRole } from '@/lib/rbac';
import { errorResponse } from '@/lib/api';
import { writeAuditLog, extractRequestMeta } from '@/lib/audit-log';

const Body = z.object({
  year: z.number().int().min(2000).max(3000),
  openAt: z.string().datetime().nullable().optional(), // ISO(含時區)或 null=不限起始
  closeAt: z.string().datetime().nullable().optional(), // ISO(含時區)或 null=不限截止
});

/**
 * 設定某年度「意願填報時窗」(僅中心 SUPER_ADMIN)。
 * openAt/closeAt 皆可為 null=該端不限;兩者皆 null=永遠開放(等同清除限制)。
 * 逾窗後受調者不可改/送出意願(中心代填不受限;可對個別受調者 editUnlocked 開放補填)。
 */
export async function PUT(req: Request) {
  try {
    const user = await requireRole('SUPER_ADMIN');
    const body = Body.parse(await req.json());
    const openAt = body.openAt ? new Date(body.openAt) : null;
    const closeAt = body.closeAt ? new Date(body.closeAt) : null;
    if (openAt && closeAt && openAt > closeAt) {
      return NextResponse.json({ error: '開放起始時間不得晚於截止時間' }, { status: 400 });
    }
    await prisma.surveyFillWindow.upsert({
      where: { year: body.year },
      create: { year: body.year, openAt, closeAt, updatedById: user.id },
      update: { openAt, closeAt, updatedById: user.id },
    });
    await writeAuditLog({
      actorId: user.id,
      action: 'SURVEY_FILL_WINDOW_SET',
      entityType: 'SurveyFillWindow',
      entityId: String(body.year),
      after: { openAt: openAt?.toISOString() ?? null, closeAt: closeAt?.toISOString() ?? null },
      ...extractRequestMeta(req),
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
