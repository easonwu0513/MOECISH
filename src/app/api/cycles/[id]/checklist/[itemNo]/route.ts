import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { assertCycleAccess, AuthError, requireRole } from '@/lib/rbac';
import { COMPLIANCE_LEVELS } from '@/lib/types';
import { writeAuditLog, extractRequestMeta } from '@/lib/audit-log';

const Body = z.object({
  compliance: z.enum(COMPLIANCE_LEVELS).nullable(),
  description: z.string().optional().nullable(),
  version: z.number().int().nonnegative(),
});

export async function PUT(
  req: Request,
  { params }: { params: { id: string; itemNo: string } },
) {
  try {
    const { user, cycle } = await assertCycleAccess(params.id);
    if (user.role !== 'RESPONDENT' && user.role !== 'SUPERVISOR') {
      return NextResponse.json({ error: '僅填報人或主管可編輯' }, { status: 403 });
    }
    if (cycle.status !== 'DRAFT' && cycle.status !== 'COMMENTS_RETURNED') {
      return NextResponse.json({ error: `目前狀態不可編輯（${cycle.status}）` }, { status: 400 });
    }

    const body = Body.parse(await req.json());

    const itemNo = decodeURIComponent(params.itemNo);
    const item = await prisma.checklistItem.findUnique({
      where: { versionId_itemNo: { versionId: cycle.checklistVersionId, itemNo } },
    });
    if (!item) return NextResponse.json({ error: '找不到檢核項目' }, { status: 404 });

    const existing = await prisma.checklistResponse.findUnique({
      where: { cycleId_checklistItemId: { cycleId: cycle.id, checklistItemId: item.id } },
    });

    if (existing && existing.version !== body.version) {
      return NextResponse.json(
        { error: '資料已被其他使用者更新，請重新整理後再試', current: existing },
        { status: 409 },
      );
    }

    const result = existing
      ? await prisma.checklistResponse.update({
          where: { id: existing.id },
          data: {
            compliance: body.compliance,
            description: body.description ?? null,
            version: existing.version + 1,
            lastEditorId: user.id,
            lastEditedAt: new Date(),
          },
        })
      : await prisma.checklistResponse.create({
          data: {
            cycleId: cycle.id,
            checklistItemId: item.id,
            compliance: body.compliance,
            description: body.description ?? null,
            version: 1,
            lastEditorId: user.id,
            lastEditedAt: new Date(),
          },
        });

    const meta = extractRequestMeta(req);
    await writeAuditLog({
      actorId: user.id,
      action: 'CHECKLIST_RESPONSE_UPDATE',
      entityType: 'ChecklistResponse',
      entityId: result.id,
      before: existing,
      after: result,
      ...meta,
    });

    return NextResponse.json(result);
  } catch (e) {
    if (e instanceof AuthError) return NextResponse.json({ error: e.message }, { status: e.status });
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}
