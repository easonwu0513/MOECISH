import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { assertCycleAccess } from '@/lib/rbac';
import { errorResponse } from '@/lib/api';
import { sendEmail } from '@/lib/email';
import { writeAuditLog, extractRequestMeta } from '@/lib/audit-log';
import { appBaseUrl } from '@/lib/baseUrl';
import { fmtROC } from '@/lib/date';

// 催繳整區(category)或逐項(requirementId)擇一
const Body = z
  .object({
    category: z.enum(['TECH', 'ONSITE']).optional(),
    requirementId: z.string().min(1).optional(),
  })
  .refine((b) => Boolean(b.category) || Boolean(b.requirementId), { message: 'category 或 requirementId 擇一' });
const CAT_LABEL: Record<string, string> = { TECH: '技術檢測', ONSITE: '實地稽核' };

/**
 * 中心(最高管理員)對受稽機關「催繳/催補」稽核前資料:寄信提醒機關管理員儘速上傳/繳交。
 * - category:整區催繳(技術檢測 / 實地稽核)
 * - requirementId:逐項催補(針對單一尚未繳交/確認的需求項)
 * 由人工點擊觸發(非自動排程);24h 內同機關同區/同項去重避免重複轟炸。
 */
export async function POST(req: Request, { params }: { params: { id: string } }) {
  try {
    const { user, cycle } = await assertCycleAccess(params.id);
    if (user.role !== 'SUPER_ADMIN') {
      return NextResponse.json({ error: '僅中心(最高管理員)可催繳' }, { status: 403 });
    }
    const { category, requirementId } = Body.parse(await req.json());

    // 逐項催補:驗證需求項屬本週期、為機關區、且尚未繳交/確認
    let itemTitle: string | null = null;
    let cat: 'TECH' | 'ONSITE';
    let dedupeKey: string;
    if (requirementId) {
      const reqItem = await prisma.prepRequirement.findUnique({
        where: { id: requirementId },
        include: { submission: { select: { status: true } } },
      });
      if (!reqItem || reqItem.cycleId !== cycle.id) {
        return NextResponse.json({ error: '找不到此需求項' }, { status: 404 });
      }
      if (reqItem.category === 'CENTER') {
        return NextResponse.json({ error: '中心匯入區由中心自行上傳,無須催機關' }, { status: 400 });
      }
      const st = reqItem.submission?.status;
      if (st === 'SUBMITTED' || st === 'CONFIRMED') {
        return NextResponse.json({ error: '此項機關已繳交/中心已確認,無須催補' }, { status: 409 });
      }
      itemTitle = reqItem.title;
      cat = reqItem.category === 'TECH' ? 'TECH' : 'ONSITE';
      dedupeKey = `prep-remind-item:${cycle.id}:${requirementId}`;
    } else {
      cat = category as 'TECH' | 'ONSITE';
      dedupeKey = `prep-remind:${cycle.id}:${cat}`;
    }

    const org = await prisma.organization.findUnique({
      where: { id: cycle.organizationId },
      select: { name: true },
    });
    const admins = await prisma.user.findMany({
      where: { organizationId: cycle.organizationId, role: 'ORG_ADMIN', isActive: true },
      select: { id: true, name: true, email: true },
    });
    if (admins.length === 0) {
      return NextResponse.json({ error: '該機關尚無啟用中的機關管理員可通知' }, { status: 400 });
    }

    const due = cat === 'TECH' ? cycle.prepDueTech : cycle.prepDueDate;
    const overdue = !!due && new Date(due) < new Date();
    const yearROC = cycle.year - 1911;
    const catLabel = CAT_LABEL[cat];
    const link = `${appBaseUrl(req)}/cycles/${cycle.id}/prep`;
    const dueStr = due ? fmtROC(due) : null;

    const subject = itemTitle
      ? `[MOECISH] 稽核前資料催補(${catLabel})— ${yearROC} 年度`
      : `[MOECISH] 稽核前資料催繳(${catLabel})— ${yearROC} 年度`;
    const body =
      `您好,\n\n` +
      (itemTitle
        ? `貴機關 ${yearROC} 年度資通安全稽核「${catLabel}」之「${itemTitle}」一項` +
          (dueStr ? `(繳交截止 ${dueStr})` : '') +
          (overdue ? ',已逾期' : '') +
          `,尚未繳交。`
        : `貴機關 ${yearROC} 年度資通安全稽核「${catLabel}」應備資料` +
          (dueStr ? `(繳交截止 ${dueStr})` : '') +
          (overdue ? ',已逾期' : '') +
          `,尚有項目待繳交。`) +
      `請儘速登入系統上傳檔案或敘明無相關文件理由,並按「確定繳交」送交中心:\n\n` +
      `${link}\n\n` +
      `— 教育部轄下醫療領域資訊安全推動中心(系統催繳通知)`;

    // 誠實回報實際寄送結果:dedupe 跳過(24h 內已催過)與寄送失敗不可計入「已通知」,
    // 否則中心重按催繳會看到假成功(實際一封都沒寄)。
    let sent = 0;
    let skipped = 0;
    let failed = 0;
    for (const a of admins) {
      const log = await sendEmail({
        to: a.email,
        toName: a.name,
        subject,
        body,
        kind: 'tracking',
        relatedCycleId: cycle.id,
        context: { remindCategory: cat, ...(requirementId ? { requirementId } : {}), manual: true, by: user.name },
        dedupeKey, // 24h 內同區/同項去重
      });
      if (log.status === 'skipped') skipped += 1;
      else if (log.status === 'failed') failed += 1;
      else sent += 1; // sent(實寄)/ simulated(demo 模式記錄)
    }

    await writeAuditLog({
      actorId: user.id,
      action: 'prep.remind',
      entityType: 'AuditCycle',
      entityId: cycle.id,
      after: { category: cat, ...(requirementId ? { requirementId } : {}), recipients: sent, skipped, failed, overdue },
      ...extractRequestMeta(req),
    });

    return NextResponse.json({ ok: true, sent, skipped, failed, org: org?.name });
  } catch (e) {
    return errorResponse(e);
  }
}
