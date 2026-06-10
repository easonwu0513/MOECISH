import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { assertCycleAccess, AuthError } from '@/lib/rbac';
import { writeAuditLog, extractRequestMeta } from '@/lib/audit-log';

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  try {
    await assertCycleAccess(params.id);
    const items = await prisma.prepRequirement.findMany({
      where: { cycleId: params.id },
      include: { submission: true },
      orderBy: { orderIndex: 'asc' },
    });
    // 帶出每個 submission 的佐證檔
    const subIds = items.map((i) => i.submission?.id).filter(Boolean) as string[];
    const files = subIds.length
      ? await prisma.evidence.findMany({
          where: { targetType: 'PREP_SUBMISSION', targetId: { in: subIds } },
          select: { id: true, targetId: true, originalName: true, sizeBytes: true, uploadedAt: true },
          orderBy: { uploadedAt: 'asc' },
        })
      : [];
    return NextResponse.json({ items, files });
  } catch (e) {
    if (e instanceof AuthError) return NextResponse.json({ error: e.message }, { status: e.status });
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

const CreateBody = z.object({
  title: z.string().min(2),
  description: z.string().optional(),
  required: z.boolean().optional(),
});

/** 預設標準清單(P2 簡化版範本;PrepTemplate 完整管理留待後續) */
const STANDARD_ITEMS: { title: string; description: string }[] = [
  { title: '資通安全實地稽核檢核表', description: '依當年度教育部公告版本填妥之檢核表(Excel/ODT)' },
  { title: '資通安全維護計畫', description: '最新核定版本' },
  { title: '資通安全維護計畫實施情形', description: '上年度實施情形報告' },
  { title: 'ISMS 驗證證書', description: 'CNS 27001 / ISO 27001 證書影本(含 TAF 認證標誌)' },
  { title: '資訊資產清冊', description: '含核心資通系統標示與防護需求分級' },
  { title: '上年度稽核改善報告', description: '若為首次受稽免附' },
];

export async function POST(req: Request, { params }: { params: { id: string } }) {
  try {
    const { user, cycle } = await assertCycleAccess(params.id);
    if (user.role !== 'SUPER_ADMIN') {
      return NextResponse.json({ error: '僅最高管理員可設定需求清單' }, { status: 403 });
    }
    if (cycle.status === 'CLOSED') {
      return NextResponse.json({ error: '已結案不可調整' }, { status: 400 });
    }

    const url = new URL(req.url);
    const meta = extractRequestMeta(req);

    // ?standard=1 → 一鍵套用標準清單
    if (url.searchParams.get('standard') === '1') {
      const existing = await prisma.prepRequirement.count({ where: { cycleId: cycle.id } });
      let order = existing;
      let created = 0;
      for (const item of STANDARD_ITEMS) {
        const dup = await prisma.prepRequirement.findFirst({
          where: { cycleId: cycle.id, title: item.title },
        });
        if (dup) continue;
        await prisma.prepRequirement.create({
          data: {
            cycleId: cycle.id,
            title: item.title,
            description: item.description,
            orderIndex: order++,
            submission: { create: {} },
          },
        });
        created++;
      }
      await writeAuditLog({
        actorId: user.id, action: 'PREP_STANDARD_APPLY', entityType: 'AuditCycle',
        entityId: cycle.id, after: { created }, ...meta,
      });
      return NextResponse.json({ created });
    }

    const body = CreateBody.parse(await req.json());
    const max = await prisma.prepRequirement.aggregate({
      where: { cycleId: cycle.id },
      _max: { orderIndex: true },
    });
    const item = await prisma.prepRequirement.create({
      data: {
        cycleId: cycle.id,
        title: body.title,
        description: body.description || null,
        required: body.required ?? true,
        orderIndex: (max._max.orderIndex ?? -1) + 1,
        submission: { create: {} },
      },
      include: { submission: true },
    });

    await writeAuditLog({
      actorId: user.id, action: 'PREP_REQUIREMENT_CREATE', entityType: 'PrepRequirement',
      entityId: item.id, after: { title: item.title }, ...meta,
    });

    return NextResponse.json({ item });
  } catch (e) {
    if (e instanceof AuthError) return NextResponse.json({ error: e.message }, { status: e.status });
    if (e instanceof z.ZodError) return NextResponse.json({ error: e.errors[0]?.message ?? '輸入有誤' }, { status: 400 });
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}
