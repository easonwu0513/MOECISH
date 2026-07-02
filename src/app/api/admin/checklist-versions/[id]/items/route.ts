import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { requireRole } from '@/lib/rbac';
import { errorResponse } from '@/lib/api';
import { dimensionFromItemNo } from '@/lib/dimension';
import { writeAuditLog, extractRequestMeta } from '@/lib/audit-log';

const Body = z.object({
  itemNo: z.string().regex(/^\d+\.\d+$/, '項次格式須為「構面.序號」,例 4.3'),
  content: z.string().min(5),
  auditBasis: z.string().nullable().optional(),
  auditFocus: z.string().nullable().optional(),
  expectedEvidence: z.string().nullable().optional(),
});

/** 新增檢核項目(構面依項次主號自動歸屬;插入排序保持項次順序)。 */
export async function POST(req: Request, { params }: { params: { id: string } }) {
  try {
    const user = await requireRole('SUPER_ADMIN');
    const version = await prisma.checklistVersion.findUnique({ where: { id: params.id } });
    if (!version) return NextResponse.json({ error: '版本不存在' }, { status: 404 });

    // 在用防護:版本已被「進行中」週期使用(推進出開立中)即不可增題——
    // 委員評分表的「判定數量合計=題數」鎖定閘以題數為基準,事後改題會讓已定稿資料靜默失真
    const inUse = await prisma.auditCycle.count({
      where: { checklistVersionId: version.id, status: { not: 'DRAFT' } },
    });
    if (inUse > 0) {
      return NextResponse.json(
        { error: `此版本已有 ${inUse} 個進行中的稽核週期使用,不可再新增題目;請以年度換版調整題庫。` },
        { status: 400 },
      );
    }

    const body = Body.parse(await req.json());

    const dup = await prisma.checklistItem.findUnique({
      where: { versionId_itemNo: { versionId: version.id, itemNo: body.itemNo } },
    });
    if (dup) return NextResponse.json({ error: `項次 ${body.itemNo} 已存在` }, { status: 400 });

    let dimension: string;
    try {
      dimension = dimensionFromItemNo(body.itemNo);
    } catch {
      return NextResponse.json({ error: '項次主號超出構面範圍(1-9)' }, { status: 400 });
    }

    // 依項次數值排序計算 orderIndex(插入後重排)
    const siblings = await prisma.checklistItem.findMany({
      where: { versionId: version.id },
      orderBy: { orderIndex: 'asc' },
      select: { id: true, itemNo: true },
    });
    const numKey = (no: string) => no.split('.').map((p) => parseInt(p, 10).toString().padStart(4, '0')).join('.');
    const all = [...siblings.map((s) => ({ id: s.id, itemNo: s.itemNo })), { id: '__new__', itemNo: body.itemNo }]
      .sort((a, b) => numKey(a.itemNo).localeCompare(numKey(b.itemNo)));

    const item = await prisma.checklistItem.create({
      data: {
        versionId: version.id,
        itemNo: body.itemNo,
        dimension,
        content: body.content,
        auditBasis: body.auditBasis ?? null,
        auditFocus: body.auditFocus ?? null,
        expectedEvidence: body.expectedEvidence ?? null,
        orderIndex: all.findIndex((x) => x.id === '__new__'),
      },
    });
    // 重排其餘項目
    for (let i = 0; i < all.length; i++) {
      if (all[i].id === '__new__') continue;
      await prisma.checklistItem.update({ where: { id: all[i].id }, data: { orderIndex: i } });
    }

    const meta = extractRequestMeta(req);
    await writeAuditLog({
      actorId: user.id,
      action: 'CHECKLIST_ITEM_CREATE',
      entityType: 'ChecklistItem',
      entityId: item.id,
      after: { versionId: version.id, itemNo: item.itemNo },
      ...meta,
    });

    return NextResponse.json({ item });
  } catch (e) {
    return errorResponse(e);
  }
}
