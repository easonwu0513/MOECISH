import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { assertCycleAccess } from '@/lib/rbac';
import { canAccess } from '@/lib/access-policy';
import { errorResponse } from '@/lib/api';
import { DEFICIENCY_ASPECTS, DEFICIENCY_TYPES, type Role } from '@/lib/types';
import { PLACEHOLDER_FINDING_RE } from '@/lib/convert-findings';
import { writeAuditLog, extractRequestMeta } from '@/lib/audit-log';

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  try {
    const { user, cycle } = await assertCycleAccess(params.id);
    // 缺失與矯正管考不對觀察員開放(批30 需求一-2);且與階段閘一致(委員缺失發布後、機關矯正執行後)。
    // 頁面已 redirect,此為 API 層權威閘(防直打 API 讀缺失清單=批30 對抗審查 P1)。
    if (user.role !== 'SUPER_ADMIN' && !canAccess('deficiencies.view', user.role as Role, cycle.status)) {
      return NextResponse.json({ error: '目前無權檢視缺失清單' }, { status: 403 });
    }
    const items = await prisma.deficiency.findMany({
      where: { cycleId: params.id },
      include: {
        action: {
          select: { id: true, status: true, round: true, execStatus: true, submittedAt: true, updatedAt: true },
        },
      },
      orderBy: [{ aspect: 'asc' }, { type: 'asc' }, { itemNo: 'asc' }],
    });
    return NextResponse.json({ items });
  } catch (e) {
    return errorResponse(e);
  }
}

const CreateBody = z.object({
  aspect: z.enum(DEFICIENCY_ASPECTS),
  type: z.enum(DEFICIENCY_TYPES),
  description: z
    .string()
    .trim()
    .min(10, '缺失描述至少 10 字')
    .refine((s) => !PLACEHOLDER_FINDING_RE.test(s), '缺失描述仍為佔位文字(請補述…),請填寫實際缺失內容後再發布'),
  checklistRef: z.string().optional(),
  itemNo: z.number().int().positive().optional(),
});

export async function POST(req: Request, { params }: { params: { id: string } }) {
  try {
    const { user, cycle } = await assertCycleAccess(params.id);
    if (user.role !== 'SUPER_ADMIN') {
      return NextResponse.json({ error: '僅最高管理員可發布缺失' }, { status: 403 });
    }
    if (cycle.status === 'CLOSED') {
      return NextResponse.json({ error: '已結案的週期不可新增缺失' }, { status: 400 });
    }
    const body = CreateBody.parse(await req.json());

    // 項次自動遞增(構面 × 類型內)+ 建立:同一交易內完成,縮短 check-then-create 競態視窗;
    // 並發撞 @@unique 由 errorResponse 轉 409(使用者重試即可)
    const created = await prisma.$transaction(async (tx) => {
      let itemNo = body.itemNo;
      if (!itemNo) {
        const max = await tx.deficiency.aggregate({
          where: { cycleId: cycle.id, aspect: body.aspect, type: body.type },
          _max: { itemNo: true },
        });
        itemNo = (max._max.itemNo ?? 0) + 1;
      }
      return tx.deficiency.create({
        data: {
          cycleId: cycle.id,
          aspect: body.aspect,
          type: body.type,
          itemNo,
          description: body.description,
          checklistRef: body.checklistRef || null,
          createdById: user.id,
          action: { create: {} },
        },
        include: { action: true },
      });
    });

    const meta = extractRequestMeta(req);
    await writeAuditLog({
      actorId: user.id,
      action: 'DEFICIENCY_CREATE',
      entityType: 'Deficiency',
      entityId: created.id,
      after: { aspect: created.aspect, type: created.type, itemNo: created.itemNo },
      ...meta,
    });

    return NextResponse.json({ item: created });
  } catch (e) {
    return errorResponse(e);
  }
}
