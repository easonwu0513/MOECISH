import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { assertCycleAccess } from '@/lib/rbac';
import { errorResponse } from '@/lib/api';
import { missingActionFields } from '@/lib/corrective-action';
import { isInvalidDeficiencyDescription } from '@/lib/convert-findings';
import { DEFICIENCY_ASPECT_LABELS, DEFICIENCY_TYPE_LABELS, type DeficiencyAspect, type DeficiencyType } from '@/lib/types';
import { notifyAuditorsOnRoundSubmit } from '@/lib/notify';
import { appBaseUrl } from '@/lib/baseUrl';
import { writeAuditLog, extractRequestMeta } from '@/lib/audit-log';

/**
 * 機關「一輪統一送出審核」(批50):把本機關本週期所有「已填寫且完整」的矯正措施(草稿/退回補正中)
 * 一次送審,並對每位委員只寄「一封」彙整通知——取代逐項送審(每項對全體委員各寄一封)造成的信件轟炸。
 * 未填完整者略過並回報缺漏,機關補齊後可再按一次(每輪每位委員仍只收一封新缺失清單)。
 */
export async function POST(req: Request, { params }: { params: { id: string } }) {
  try {
    const { user, cycle } = await assertCycleAccess(params.id);
    if (user.role !== 'ORG_ADMIN') {
      return NextResponse.json({ error: '僅機關管理員可送出審核' }, { status: 403 });
    }
    if (cycle.status !== 'REMEDIATION') {
      return NextResponse.json({ error: '此週期目前未開放填報' }, { status: 400 });
    }

    // 候選=本週期「草稿(DRAFT)或退回補正中(RETURNED)」的矯正措施(PENDING=尚未填、SUBMITTED/PASSED=已送/已過,均不納入)
    const defs = await prisma.deficiency.findMany({
      where: { cycleId: cycle.id, action: { status: { in: ['DRAFT', 'RETURNED'] } } },
      include: { action: true },
      orderBy: [{ aspect: 'asc' }, { type: 'asc' }, { itemNo: 'asc' }],
    });

    const toSubmitIds: string[] = [];
    const skipped: { itemNo: number; label: string; missing: string[] }[] = [];
    for (const d of defs) {
      if (!d.action) continue;
      const label = `${DEFICIENCY_ASPECT_LABELS[d.aspect as DeficiencyAspect]}－${DEFICIENCY_TYPE_LABELS[d.type as DeficiencyType]} 第 ${d.itemNo} 項`;
      // 缺失描述仍為佔位/空白者不可送審(機關無從據以填報矯正;由中心補述後再送)——與個別送審同閘(批51)
      if (isInvalidDeficiencyDescription(d.description)) {
        skipped.push({ itemNo: d.itemNo, label, missing: ['缺失描述尚未補述'] });
        continue;
      }
      const missing = missingActionFields(d.action);
      if (missing.length === 0) toSubmitIds.push(d.id);
      else skipped.push({ itemNo: d.itemNo, label, missing });
    }

    if (toSubmitIds.length === 0) {
      const msg =
        defs.length === 0
          ? '目前沒有可送審的項目;請先填寫矯正措施並「儲存草稿」後再統一送出。'
          : `尚有 ${skipped.length} 項未填寫完整,無可送審項目;請補齊後再送出。`;
      return NextResponse.json({ error: msg, submitted: 0, skipped }, { status: 400 });
    }

    // 以 status 為條件的 updateMany(樂觀鎖):只轉仍為 DRAFT/RETURNED 者,防與個別送審/退件並發重覆送出
    const res = await prisma.correctiveAction.updateMany({
      where: { deficiencyId: { in: toSubmitIds }, status: { in: ['DRAFT', 'RETURNED'] } },
      data: { status: 'SUBMITTED', submittedAt: new Date() },
    });

    await writeAuditLog({
      actorId: user.id,
      action: 'ACTION_SUBMIT_ROUND',
      entityType: 'AuditCycle',
      entityId: cycle.id,
      after: { submitted: res.count, deficiencyIds: toSubmitIds, skipped: skipped.length },
      ...extractRequestMeta(req),
    });

    // 一輪一封:每位委員只收一封彙整信(寄信失敗不影響送審結果)
    let notified = 0;
    try {
      const r = await notifyAuditorsOnRoundSubmit({
        cycleId: cycle.id,
        deficiencyIds: toSubmitIds,
        appBaseUrl: appBaseUrl(req),
      });
      notified = r.recipientCount;
    } catch (e) {
      console.error('notifyAuditorsOnRoundSubmit failed:', e);
    }

    return NextResponse.json({ submitted: res.count, skipped, notified });
  } catch (e) {
    return errorResponse(e);
  }
}
