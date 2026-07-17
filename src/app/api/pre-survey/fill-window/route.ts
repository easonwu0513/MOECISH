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
  // UAT 圖7:第二時窗(差旅/飲食調查);意願與文件上傳共用第一時窗
  travelOpenAt: z.string().datetime().nullable().optional(),
  travelCloseAt: z.string().datetime().nullable().optional(),
  // UAT 圖30:本年度是否開放觀察員填寫差旅費領據(單獨切換;未提供=不變)
  observerReceiptEnabled: z.boolean().optional(),
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
    const travelOpenAt = body.travelOpenAt ? new Date(body.travelOpenAt) : null;
    const travelCloseAt = body.travelCloseAt ? new Date(body.travelCloseAt) : null;
    if (openAt && closeAt && openAt > closeAt) {
      return NextResponse.json({ error: '開放起始時間不得晚於截止時間' }, { status: 400 });
    }
    if (travelOpenAt && travelCloseAt && travelOpenAt > travelCloseAt) {
      return NextResponse.json({ error: '差旅調查起始時間不得晚於截止時間' }, { status: 400 });
    }
    // undefined-preserving:各欄「未提供=不變」——開關可單獨切換而不清掉時窗(UAT 圖30)
    await prisma.surveyFillWindow.upsert({
      where: { year: body.year },
      create: {
        year: body.year,
        openAt,
        closeAt,
        travelOpenAt,
        travelCloseAt,
        observerReceiptEnabled: body.observerReceiptEnabled ?? false,
        updatedById: user.id,
      },
      update: {
        openAt: body.openAt === undefined ? undefined : openAt,
        closeAt: body.closeAt === undefined ? undefined : closeAt,
        travelOpenAt: body.travelOpenAt === undefined ? undefined : travelOpenAt,
        travelCloseAt: body.travelCloseAt === undefined ? undefined : travelCloseAt,
        observerReceiptEnabled: body.observerReceiptEnabled,
        updatedById: user.id,
      },
    });
    await writeAuditLog({
      actorId: user.id,
      action: 'SURVEY_FILL_WINDOW_SET',
      entityType: 'SurveyFillWindow',
      entityId: String(body.year),
      after: {
        openAt: openAt?.toISOString() ?? null,
        closeAt: closeAt?.toISOString() ?? null,
        travelOpenAt: travelOpenAt?.toISOString() ?? null,
        travelCloseAt: travelCloseAt?.toISOString() ?? null,
      },
      ...extractRequestMeta(req),
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
