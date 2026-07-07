import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { assertCycleAccess } from '@/lib/rbac';
import { errorResponse } from '@/lib/api';
import { writeAuditLog, extractRequestMeta } from '@/lib/audit-log';

const SectionPB = z.object({ pageBreakBefore: z.boolean() });
const CatSettings = z.object({
  pageBreakBefore: z.boolean(),
  compliance: SectionPB,
  improvements: SectionPB,
  suggestions: SectionPB,
});

// 中心撰寫覆蓋層的逐構面陣列(批34 圖4:三區段 compliance/improvements/suggestions 共用同結構)。
const OverrideItem = z.object({ code: z.string().max(50), text: z.string().max(20000), pageBreakBefore: z.boolean().optional() });
const OverrideCat = z.object({
  strategy: z.array(OverrideItem).max(200).optional(),
  management: z.array(OverrideItem).max(200).optional(),
  technical: z.array(OverrideItem).max(200).optional(),
});

const Body = z.object({
  auditDateRaw: z.string().optional(),
  scope: z.string().optional(),
  auditCriteria: z.array(z.string()).optional(),
  lead: z.object({ name: z.string(), title: z.string() }).optional(),
  subLead: z.object({ name: z.string(), title: z.string(), org: z.string() }).optional(),
  team: z.object({
    strategy: z.array(z.string()),
    management: z.array(z.string()),
    technical: z.array(z.string()),
  }).optional(),
  // 版面換頁設定(彙整工具「設定構面換頁」等)存回系統,使正式報告列印同步顯示分頁。
  sectionSettings: z.object({
    strategy: CatSettings,
    management: CatSettings,
    technical: CatSettings,
  }).optional(),
  // 逐則發現的「此前換頁」(以 AuditFinding.id 為鍵;true 者才記錄)。
  findingBreaks: z.record(z.boolean()).optional(),
  // 中心撰寫覆蓋層:每構面一組 {項次代碼, 文字, 此前換頁};有此段則正式報告取此覆蓋值、不取該(構面×區段)
  // 委員即時發現。批28 只開放「法遵符合情形」;批34 圖4 擴及「待改善/建議」——中心於彙整工具改的三區段
  // 文字都能同步到正式列印(WYSIWYG)。三者結構相同,長度上限防灌爆。
  complianceOverride: OverrideCat.optional(),
  improvementsOverride: OverrideCat.optional(),
  suggestionsOverride: OverrideCat.optional(),
});

/** 最高管理員設定彙整報告頁首(稽核日期/範圍/準則/稽核小組)。 */
export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  try {
    const { user, cycle } = await assertCycleAccess(params.id);
    if (user.role !== 'SUPER_ADMIN') {
      return NextResponse.json({ error: '僅最高管理員可設定報告資訊' }, { status: 403 });
    }
    const body = Body.parse(await req.json());

    const prev = cycle.auditReportMeta ? JSON.parse(cycle.auditReportMeta) : {};
    const merged = { ...prev, ...body };
    await prisma.auditCycle.update({
      where: { id: cycle.id },
      data: { auditReportMeta: JSON.stringify(merged) },
    });

    await writeAuditLog({
      actorId: user.id,
      action: 'audit.report-meta.update',
      entityType: 'AuditCycle',
      entityId: cycle.id,
      after: merged,
      ...extractRequestMeta(req),
    });

    return NextResponse.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
