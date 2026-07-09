import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { assertDeficiencyAccess } from '@/lib/rbac';
import { errorResponse } from '@/lib/api';
import { actionEditable } from '@/lib/state-machine';
import type { ActionStatus } from '@/lib/types';
import { missingActionFields } from '@/lib/corrective-action';
import { writeAuditLog, extractRequestMeta } from '@/lib/audit-log';
import { notifyAuditorsOnSubmit } from '@/lib/notify';
import { appBaseUrl } from '@/lib/baseUrl';

/** 機關管理員提交矯正措施送審（驗證必填欄位） */
export async function POST(req: Request, { params }: { params: { id: string } }) {
  try {
    const { user, deficiency } = await assertDeficiencyAccess(params.id);
    if (user.role !== 'ORG_ADMIN') {
      return NextResponse.json({ error: '僅機關管理員可提交' }, { status: 403 });
    }
    if (deficiency.cycle.status !== 'REMEDIATION') {
      return NextResponse.json({ error: '此週期目前未開放填報' }, { status: 400 });
    }
    const action = deficiency.action;
    if (!action) return NextResponse.json({ error: '矯正措施紀錄不存在' }, { status: 404 });
    if (!actionEditable(action.status as ActionStatus)) {
      return NextResponse.json({ error: '此項目已送審或已通過' }, { status: 400 });
    }

    // 必填驗證(對齊範本;與批次一輪送審共用 missingActionFields)
    const missing = missingActionFields(action);
    if (missing.length > 0) {
      return NextResponse.json({ error: `尚未填寫：${missing.join('、')}` }, { status: 400 });
    }

    const updated = await prisma.correctiveAction.update({
      where: { id: action.id },
      data: { status: 'SUBMITTED', submittedAt: new Date() },
    });

    const meta = extractRequestMeta(req);
    await writeAuditLog({
      actorId: user.id,
      action: 'ACTION_SUBMIT',
      entityType: 'CorrectiveAction',
      entityId: action.id,
      before: { status: action.status, round: action.round },
      after: { status: 'SUBMITTED', round: action.round },
      ...meta,
    });

    // 通知受指派委員有件待審(寄信失敗不影響送審結果)
    try {
      await notifyAuditorsOnSubmit({ deficiencyId: deficiency.id, appBaseUrl: appBaseUrl(req) });
    } catch (e) {
      console.error('notifyAuditorsOnSubmit failed:', e);
    }

    return NextResponse.json({ item: updated });
  } catch (e) {
    return errorResponse(e);
  }
}
