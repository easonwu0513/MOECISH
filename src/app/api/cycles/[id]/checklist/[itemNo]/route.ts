import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { assertCycleAccess, requireRole } from '@/lib/rbac';
import { errorResponse } from '@/lib/api';
import { COMPLIANCE_LEVELS, checklistOrgCanEdit } from '@/lib/types';
import { writeAuditLog, extractRequestMeta } from '@/lib/audit-log';

const Body = z.object({
  compliance: z.enum(COMPLIANCE_LEVELS).nullable(),
  description: z.string().optional().nullable(),
  recordDocs: z.string().optional().nullable(),
  version: z.number().int().nonnegative(),
});

export async function PUT(
  req: Request,
  { params }: { params: { id: string; itemNo: string } },
) {
  try {
    const { user, cycle } = await assertCycleAccess(params.id);
    if (user.role !== 'ORG_ADMIN') {
      return NextResponse.json({ error: '僅機關管理員可編輯' }, { status: 403 });
    }
    if (!checklistOrgCanEdit(cycle.status)) {
      return NextResponse.json({ error: '需於「資料準備中」階段才能填報（開立中尚未開放、資料準備結束後鎖定）' }, { status: 400 });
    }
    if (cycle.checklistSubmittedAt) {
      return NextResponse.json(
        { error: '填報已送出鎖定，如需修改請洽中心退回重填' },
        { status: 409 },
      );
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

    let result;
    if (existing) {
      // 樂觀鎖下沉至 SQL:條件式 updateMany(WHERE 帶 version)使「讀-比對-寫」變原子,
      // 消除兩位機關管理員同時填報時各讀到同 version、各自 +1 而後者靜默覆蓋前者的遺失更新競態。
      const upd = await prisma.checklistResponse.updateMany({
        where: { id: existing.id, version: body.version },
        data: {
          compliance: body.compliance,
          description: body.description ?? null,
          recordDocs: body.recordDocs ?? null,
          version: { increment: 1 },
          lastEditorId: user.id,
          lastEditedAt: new Date(),
        },
      });
      if (upd.count === 0) {
        // 讀後、寫前被他人更新(version 已不符)→ 回最新值供前端重整
        const current = await prisma.checklistResponse.findUnique({ where: { id: existing.id } });
        return NextResponse.json(
          { error: '資料已被其他使用者更新，請重新整理後再試', current },
          { status: 409 },
        );
      }
      result = await prisma.checklistResponse.findUnique({ where: { id: existing.id } });
      if (!result) {
        return NextResponse.json({ error: '更新後查無資料，請重新整理後再試' }, { status: 500 });
      }
    } else {
      // 首次建立:@@unique(cycleId, checklistItemId) 保證並發建立不產生重複列(第二筆撞 P2002 → errorResponse 409)
      result = await prisma.checklistResponse.create({
        data: {
          cycleId: cycle.id,
          checklistItemId: item.id,
          compliance: body.compliance,
          description: body.description ?? null,
          recordDocs: body.recordDocs ?? null,
          version: 1,
          lastEditorId: user.id,
          lastEditedAt: new Date(),
        },
      });
    }

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
    return errorResponse(e);
  }
}
