import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { requireUser, AuthError } from '@/lib/rbac';
import { writeAuditLog, extractRequestMeta } from '@/lib/audit-log';
import { errorResponse } from '@/lib/api';
import { prepReviewable, prepCyclePhaseOpen } from '@/lib/types';
import { notifyPrepReturned } from '@/lib/notify';
import { appBaseUrl } from '@/lib/baseUrl';

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

const OrgBody = z.object({
  note: z.string().optional(),
  // 無相關文件理由(與檔案二擇一);傳 '' 或 null 代表清除
  noFileReason: z.string().nullable().optional(),
});

/**
 * 機關管理員:更新備註 / 無檔案理由,並依「是否已處理(有檔或有理由)」重算狀態(EMPTY ↔ UPLOADED)。
 * 已繳交(SUBMITTED)或已確認(CONFIRMED)的項目鎖定,需中心退回才能再編輯。
 */
export async function PUT(req: Request, { params }: { params: { id: string } }) {
  try {
    const { user, sub, cycle } = await loadWithAccess(params.id);
    if (user.role !== 'ORG_ADMIN') {
      return NextResponse.json({ error: '僅機關管理員可更新' }, { status: 403 });
    }
    if (sub.requirement.category === 'CENTER') {
      return NextResponse.json({ error: '中心匯入區由中心管理,機關無法操作' }, { status: 403 });
    }
    if (!prepCyclePhaseOpen(cycle.status)) {
      return NextResponse.json({ error: '資料準備階段已結束,不可再修改' }, { status: 400 });
    }
    if (sub.status === 'SUBMITTED' || sub.status === 'CONFIRMED') {
      return NextResponse.json({ error: '資料已繳交或已確認齊備,如需修改請洽中心退回' }, { status: 400 });
    }
    const body = OrgBody.parse(await req.json());

    const fileCount = await prisma.evidence.count({
      where: { targetType: 'PREP_SUBMISSION', targetId: sub.id },
    });
    const nextReason =
      body.noFileReason !== undefined ? (body.noFileReason?.trim() || null) : sub.noFileReason;
    const addressed = fileCount > 0 || !!nextReason;
    const nextStatus = addressed ? 'UPLOADED' : 'EMPTY';

    const updated = await prisma.prepSubmission.update({
      where: { id: sub.id },
      data: {
        ...(body.note !== undefined ? { note: body.note } : {}),
        ...(body.noFileReason !== undefined ? { noFileReason: nextReason } : {}),
        status: nextStatus,
        // 補正重傳後清掉退回註記
        ...(sub.status === 'INSUFFICIENT' && nextStatus === 'UPLOADED'
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

/**
 * 最高管理員(中心):確認齊備 / 退回補正(退回必填說明)。
 * 僅可審核「機關已確定繳交」(SUBMITTED)或先前已確認(CONFIRMED,可再退回)之項目;
 * 草稿/未處理(機關尚未繳交)不可審。資料準備由中心單一審核,避免多委員衝突。
 */
export async function POST(req: Request, { params }: { params: { id: string } }) {
  try {
    const { user, sub, cycle } = await loadWithAccess(params.id);
    if (user.role !== 'SUPER_ADMIN') {
      return NextResponse.json({ error: '僅最高管理員可審核資料準備' }, { status: 403 });
    }
    if (sub.requirement.category === 'CENTER') {
      return NextResponse.json({ error: '中心匯入區無需審核(中心直接上傳供委員審閱)' }, { status: 400 });
    }
    if (cycle.status !== 'PREPARATION') {
      return NextResponse.json({ error: '此週期已離開資料準備階段,不可審核資料準備' }, { status: 400 });
    }
    const body = ReviewBody.parse(await req.json());
    if (!prepReviewable(sub.status)) {
      return NextResponse.json({ error: '機關尚未確定繳交此項,無法審核' }, { status: 400 });
    }
    if (body.status === 'CONFIRMED' && sub.status !== 'SUBMITTED') {
      return NextResponse.json({ error: '僅可確認機關已繳交之項目' }, { status: 400 });
    }
    if (body.status === 'INSUFFICIENT' && !body.reviewNote?.trim()) {
      return NextResponse.json({ error: '退回補正必須填寫說明' }, { status: 400 });
    }

    const updated = await prisma.prepSubmission.update({
      where: { id: sub.id },
      data: {
        status: body.status,
        reviewNote: body.status === 'INSUFFICIENT' ? (body.reviewNote?.trim() || null) : null,
        reviewedById: user.id,
        reviewedAt: new Date(),
      },
    });

    const meta = extractRequestMeta(req);
    await writeAuditLog({
      actorId: user.id,
      action: body.status === 'CONFIRMED' ? 'PREP_CONFIRM' : 'PREP_RETURN',
      entityType: 'PrepSubmission',
      entityId: sub.id,
      after: { status: updated.status },
      ...meta,
    });

    // 退回 → 通知機關補正(失敗不擋審核結果)
    if (body.status === 'INSUFFICIENT') {
      await notifyPrepReturned({
        submissionId: sub.id,
        reviewNote: updated.reviewNote ?? '',
        appBaseUrl: appBaseUrl(req),
      }).catch(() => {});
    }

    return NextResponse.json({ item: updated });
  } catch (e) {
    return errorResponse(e);
  }
}
