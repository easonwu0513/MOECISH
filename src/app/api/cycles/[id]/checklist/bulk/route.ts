import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { assertCycleAccess } from '@/lib/rbac';
import { errorResponse } from '@/lib/api';
import { writeAuditLog, extractRequestMeta } from '@/lib/audit-log';
import { checklistOrgCanEdit } from '@/lib/types';

/**
 * 一鍵將「未作答」項目全部標記為「不適用」。只動未作答項,不覆寫既有作答。
 * P0 安全批:移除 fill: 'COMPLIANT' 捷徑——「全標符合」可零說明零佐證偽造整份自評
 * (符合情形應逐題據實填報;不適用屬「本機關無此項目」的批次宣告,語意可接受批次)。
 */
export async function POST(req: Request, { params }: { params: { id: string } }) {
  try {
    const body = await req.json().catch(() => ({}));
    // P1:mode='CLEAR' 為批次標記的反向操作——把「僅有不適用、無任何說明/佐證/紀錄文件」的題
    // 清回未作答(誤按一鍵標記的復原路徑);有填內容者一律不動,不會誤刪機關心血。
    const mode = (body as { mode?: string })?.mode === 'CLEAR' ? 'CLEAR' : 'FILL';
    const fill = 'NOT_APPLICABLE';
    const { user, cycle } = await assertCycleAccess(params.id);
    if (user.role !== 'ORG_ADMIN') {
      return NextResponse.json({ error: '僅機關管理員可操作' }, { status: 403 });
    }
    if (!checklistOrgCanEdit(cycle.status)) {
      return NextResponse.json({ error: '需於「資料準備中」階段才能填報（開立中尚未開放）' }, { status: 400 });
    }
    if (cycle.checklistSubmittedAt) {
      return NextResponse.json(
        { error: '填報已送出鎖定，如需修改請洽中心退回重填' },
        { status: 409 },
      );
    }

    // 復原路徑:清掉「不適用且無任何內容」的作答(有佐證檔者亦不動)
    if (mode === 'CLEAR') {
      const naEmpty = await prisma.checklistResponse.findMany({
        where: {
          cycleId: cycle.id,
          compliance: 'NOT_APPLICABLE',
          OR: [{ description: null }, { description: '' }],
          AND: [{ OR: [{ recordDocs: null }, { recordDocs: '' }] }],
        },
        select: { id: true },
      });
      const ids = naEmpty.map((r) => r.id);
      const withFiles = ids.length
        ? await prisma.evidence.findMany({
            where: { targetType: 'CHECKLIST_RESPONSE', targetId: { in: ids } },
            select: { targetId: true },
            distinct: ['targetId'],
          })
        : [];
      const skip = new Set(withFiles.map((e) => e.targetId));
      const clearIds = ids.filter((id) => !skip.has(id));
      let cleared = 0;
      if (clearIds.length > 0) {
        // 對抗審查:謂詞隨 updateMany 重帶(讀-寫之間若有逐題 PUT 填入內容,該題不清)+
        // version increment(全庫樂觀鎖不變式:任何寫入都 bump,與 FILL 分支對稱)
        const upd = await prisma.checklistResponse.updateMany({
          where: {
            id: { in: clearIds },
            compliance: 'NOT_APPLICABLE',
            OR: [{ description: null }, { description: '' }],
            AND: [{ OR: [{ recordDocs: null }, { recordDocs: '' }] }],
          },
          data: { compliance: null, version: { increment: 1 }, lastEditorId: user.id, lastEditedAt: new Date() },
        });
        cleared = upd.count;
      }
      await writeAuditLog({
        actorId: user.id,
        action: 'CHECKLIST_BULK_CLEAR',
        entityType: 'AuditCycle',
        entityId: cycle.id,
        after: { cleared, skippedWithEvidence: ids.length - clearIds.length },
        ...extractRequestMeta(req),
      });
      return NextResponse.json({ cleared, kept: ids.length - clearIds.length });
    }

    const items = await prisma.checklistItem.findMany({
      where: { versionId: cycle.checklistVersionId },
      select: { id: true },
    });
    const answered = await prisma.checklistResponse.findMany({
      where: { cycleId: cycle.id, compliance: { not: null } },
      select: { checklistItemId: true },
    });
    const answeredSet = new Set(answered.map((r) => r.checklistItemId));
    const targets = items.filter((i) => !answeredSet.has(i.id));

    // 整批包進單一交易:中途失敗則全數回滾,不留半套作答
    const updated = await prisma.$transaction(async (tx) => {
      let n = 0;
      for (const it of targets) {
        await tx.checklistResponse.upsert({
          where: { cycleId_checklistItemId: { cycleId: cycle.id, checklistItemId: it.id } },
          create: {
            cycleId: cycle.id,
            checklistItemId: it.id,
            compliance: fill,
            version: 1,
            lastEditorId: user.id,
            lastEditedAt: new Date(),
          },
          update: {
            compliance: fill,
            version: { increment: 1 },
            lastEditorId: user.id,
            lastEditedAt: new Date(),
          },
        });
        n++;
      }
      return n;
    });

    const meta = extractRequestMeta(req);
    await writeAuditLog({
      actorId: user.id,
      action: 'CHECKLIST_BULK_FILL',
      entityType: 'AuditCycle',
      entityId: cycle.id,
      after: { updated, fill },
      ...meta,
    });

    return NextResponse.json({ updated, fill });
  } catch (e) {
    return errorResponse(e);
  }
}
