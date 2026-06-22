import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { requireUser, AuthError } from '@/lib/rbac';
import { writeAuditLog, extractRequestMeta } from '@/lib/audit-log';
import { errorResponse } from '@/lib/api';

async function loadWithAccess(submissionId: string) {
  const user = await requireUser();
  const sub = await prisma.prepSubmission.findUnique({
    where: { id: submissionId },
    include: {
      requirement: {
        include: { cycle: { include: { assignments: true } } },
      },
    },
  });
  if (!sub) throw new AuthError(404, '資料項不存在');
  const cycle = sub.requirement.cycle;
  if (user.role === 'ORG_ADMIN' && cycle.organizationId !== user.organizationId) {
    throw new AuthError(403, '不可存取他機關的資料');
  }
  if (user.role === 'AUDITOR' && !cycle.assignments.some((a) => a.auditorId === user.id)) {
    throw new AuthError(403, '您未被指派此稽核週期');
  }
  return { user, sub, cycle };
}

const OrgBody = z.object({ note: z.string().optional() });

/** 機關管理員:更新備註 + 依檔案數重算狀態(EMPTY/UPLOADED;委員已確認則不動) */
export async function PUT(req: Request, { params }: { params: { id: string } }) {
  try {
    const { user, sub } = await loadWithAccess(params.id);
    if (user.role !== 'ORG_ADMIN') {
      return NextResponse.json({ error: '僅機關管理員可更新' }, { status: 403 });
    }
    const body = OrgBody.parse(await req.json());

    const fileCount = await prisma.evidence.count({
      where: { targetType: 'PREP_SUBMISSION', targetId: sub.id },
    });
    const nextStatus =
      sub.status === 'CONFIRMED'
        ? 'CONFIRMED'
        : fileCount > 0
        ? 'UPLOADED'
        : 'EMPTY';

    const updated = await prisma.prepSubmission.update({
      where: { id: sub.id },
      data: {
        note: body.note,
        status: nextStatus,
        // 重新上傳後清掉缺件註記
        ...(nextStatus === 'UPLOADED' && sub.status === 'INSUFFICIENT'
          ? { reviewNote: null, reviewedById: null, reviewedAt: null }
          : {}),
      },
    });

    const meta = extractRequestMeta(req);
    await writeAuditLog({
      actorId: user.id, action: 'PREP_SUBMISSION_UPDATE', entityType: 'PrepSubmission',
      entityId: sub.id, after: { status: updated.status }, ...meta,
    });

    return NextResponse.json({ item: updated });
  } catch (e) {
    return errorResponse(e);
  }
}

const ReviewBody = z.object({
  status: z.enum(['CONFIRMED', 'INSUFFICIENT']),
  reviewNote: z.string().optional(),
});

/** 最高管理員(中心):確認 / 標缺件(缺件必填理由)。資料準備由中心單一審核,避免多委員衝突。 */
export async function POST(req: Request, { params }: { params: { id: string } }) {
  try {
    const { user, sub } = await loadWithAccess(params.id);
    if (user.role !== 'SUPER_ADMIN') {
      return NextResponse.json({ error: '僅最高管理員可確認資料準備' }, { status: 403 });
    }
    const body = ReviewBody.parse(await req.json());
    if (body.status === 'INSUFFICIENT' && !body.reviewNote?.trim()) {
      return NextResponse.json({ error: '標記缺件必須填寫說明' }, { status: 400 });
    }

    const updated = await prisma.prepSubmission.update({
      where: { id: sub.id },
      data: {
        status: body.status,
        reviewNote: body.reviewNote?.trim() || null,
        reviewedById: user.id,
        reviewedAt: new Date(),
      },
    });

    const meta = extractRequestMeta(req);
    await writeAuditLog({
      actorId: user.id,
      action: body.status === 'CONFIRMED' ? 'PREP_CONFIRM' : 'PREP_INSUFFICIENT',
      entityType: 'PrepSubmission',
      entityId: sub.id,
      after: { status: updated.status },
      ...meta,
    });

    return NextResponse.json({ item: updated });
  } catch (e) {
    return errorResponse(e);
  }
}
