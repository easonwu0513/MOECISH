import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { requireUser, AuthError } from '@/lib/rbac';
import { writeAuditLog, extractRequestMeta } from '@/lib/audit-log';
import { errorResponse } from '@/lib/api';

const Body = z.object({ note: z.string().max(5000) });

/**
 * 機關對委員意見的「補正回應」(文字):與原填答區隔、不覆寫原內容。
 * 僅該機關 ORG_ADMIN、且該題已有委員意見時可填(即使檢核表已送出鎖定,此屬針對意見之補正,允許)。
 */
export async function POST(req: Request, { params }: { params: { id: string } }) {
  try {
    const user = await requireUser();
    if (user.role !== 'ORG_ADMIN') {
      return NextResponse.json({ error: '僅機關管理員可填寫補正回應' }, { status: 403 });
    }
    const resp = await prisma.checklistResponse.findUnique({
      where: { id: params.id },
      include: { cycle: true, _count: { select: { comments: true } } },
    });
    if (!resp) throw new AuthError(404, '作答不存在');
    if (resp.cycle.organizationId !== user.organizationId) {
      return NextResponse.json({ error: '不可存取他機關資料' }, { status: 403 });
    }
    if (resp.cycle.status === 'CLOSED') {
      return NextResponse.json({ error: '週期已結案，不可再填補正回應' }, { status: 409 });
    }
    if (resp._count.comments === 0) {
      return NextResponse.json({ error: '本題尚無委員意見，無需補正回應' }, { status: 400 });
    }

    const body = Body.parse(await req.json());
    const updated = await prisma.checklistResponse.update({
      where: { id: resp.id },
      data: { orgRevisionNote: body.note.trim() || null },
    });

    await writeAuditLog({
      actorId: user.id,
      action: 'CHECKLIST_ORG_REVISION',
      entityType: 'ChecklistResponse',
      entityId: resp.id,
      after: { hasNote: !!updated.orgRevisionNote },
      ...extractRequestMeta(req),
    });

    return NextResponse.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
