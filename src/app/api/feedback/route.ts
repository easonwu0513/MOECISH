import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { requireUser } from '@/lib/rbac';
import { errorResponse } from '@/lib/api';
import { writeAuditLog, extractRequestMeta } from '@/lib/audit-log';

const Body = z.object({
  content: z.string().trim().min(1, '請描述您遇到的問題').max(2000),
  page: z.string().trim().max(300).optional(), // 送出當下頁面路徑(前端自動帶入)
});

/**
 * 問題回饋(UAT 圖50,取代 AI 小幫手):任何登入使用者可送出操作問題或建議;
 * 存 FeedbackReport(含現用身分與頁面路徑快照),中心於 /admin/feedback 檢視處理。
 */
export async function POST(req: Request) {
  try {
    const user = await requireUser();
    const body = Body.parse(await req.json());

    const item = await prisma.feedbackReport.create({
      data: {
        userId: user.id,
        role: user.role,
        page: body.page?.startsWith('/') ? body.page : null,
        content: body.content,
      },
      select: { id: true },
    });

    await writeAuditLog({
      actorId: user.id,
      action: 'FEEDBACK_SUBMIT',
      entityType: 'FeedbackReport',
      entityId: item.id,
      after: { page: body.page ?? null },
      ...extractRequestMeta(req),
    });

    return NextResponse.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
