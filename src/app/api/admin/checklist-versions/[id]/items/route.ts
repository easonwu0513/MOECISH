import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { requireRole, AuthError } from '@/lib/rbac';
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
    if (e instanceof AuthError) return NextResponse.json({ error: e.message }, { status: e.status });
    if (e instanceof z.ZodError) return NextResponse.json({ error: e.errors[0]?.message ?? '輸入有誤' }, { status: 400 });
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}
