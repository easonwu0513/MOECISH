import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { assertDeficiencyAccess, AuthError } from '@/lib/rbac';
import { actionEditable } from '@/lib/state-machine';
import type { ActionStatus, ExecStatus } from '@/lib/types';
import { writeAuditLog, extractRequestMeta } from '@/lib/audit-log';

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

    // 必填驗證(對齊範本)
    const missing: string[] = [];
    if (!action.rootCause?.trim()) missing.push('發生原因（根因分析）');
    if (!action.measureStrategy?.trim() && !action.measureManagement?.trim() && !action.measureTechnical?.trim()) {
      missing.push('至少一項改善措施');
    }
    if (!action.plannedDate) missing.push('預計完成時程');
    if (!action.trackingMethod?.trim()) missing.push('進度追蹤方式');
    if (!action.execStatus) missing.push('執行情形');
    const exec = action.execStatus as ExecStatus | null;
    if ((exec === 'ON_TIME_DONE' || exec === 'LATE_DONE') && !action.actualDate) {
      missing.push('實際完成日期');
    }
    if (exec === 'LATE_IN_PROGRESS' && !action.extendedDate) {
      missing.push('預計完成日期（延長至）');
    }
    if ((exec === 'LATE_DONE' || exec === 'LATE_IN_PROGRESS') && !action.delayReason?.trim()) {
      missing.push('逾期原因');
    }
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

    return NextResponse.json({ item: updated });
  } catch (e) {
    if (e instanceof AuthError) return NextResponse.json({ error: e.message }, { status: e.status });
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}
