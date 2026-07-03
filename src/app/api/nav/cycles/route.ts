import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireUser } from '@/lib/rbac';
import { errorResponse } from '@/lib/api';

// 側欄階層樹依登入者即時查詢(委員新指派/階段推進要立刻反映),不可靜態快取
export const dynamic = 'force-dynamic';

/**
 * 側欄「稽核週期」階層樹的資料來源(UAT 批65):回傳登入者可見的週期最小欄位,
 * 供 Sidebar 派生「年度 → 醫院 → 工作區」樹。
 * 角色過濾與 /cycles 清單頁一致(SoT 同一組規則,勿各自漂移):
 *  - SUPER_ADMIN:全部
 *  - ORG_ADMIN:僅自家機關
 *  - AUDITOR:僅受指派;且對齊 access-policy 'cycle.access'——開立中(DRAFT)不可見、
 *    已結案(CLOSED)資料鎖定不可進入(/cycles 清單顯示「已結案」不可點,側欄樹則不列)。
 * 子連結(工作區)的角色×階段判斷在前端以 access-policy 純函式派生,此處只給最小事實。
 */
export async function GET() {
  try {
    const user = await requireUser();

    const where =
      user.role === 'ORG_ADMIN'
        ? { organizationId: user.organizationId ?? '__none__' }
        : user.role === 'AUDITOR'
          ? { assignments: { some: { auditorId: user.id } }, status: { notIn: ['DRAFT', 'CLOSED'] } }
          : {};

    const cycles = await prisma.auditCycle.findMany({
      where,
      select: {
        id: true,
        year: true,
        status: true,
        organization: { select: { name: true } },
      },
      orderBy: [{ year: 'desc' }, { organization: { name: 'asc' } }, { createdAt: 'desc' }],
    });

    // 各週期的資料準備分類是否有項目:樹端只列實際存在的分類錨點
    // (PrepBoard 對空分類不渲染 section=錨點不存在,無條件列出會成「點了沒反應」的死錨點——三鏡審查 confirmed)
    const ids = cycles.map((c) => c.id);
    const catGroups = ids.length
      ? await prisma.prepRequirement.groupBy({
          by: ['cycleId', 'category'],
          where: { cycleId: { in: ids } },
          _count: { _all: true },
        })
      : [];
    const hasCat = new Set(catGroups.filter((g) => g._count._all > 0).map((g) => `${g.cycleId}:${g.category}`));

    return NextResponse.json(
      {
        cycles: cycles.map((c) => ({
          id: c.id,
          year: c.year,
          status: c.status,
          orgName: c.organization.name,
          prep: {
            tech: hasCat.has(`${c.id}:TECH`),
            onsite: hasCat.has(`${c.id}:ONSITE`),
            center: hasCat.has(`${c.id}:CENTER`),
          },
        })),
      },
      // 角色/指派相關的私有資料,不可被共用快取;新指派需即時反映
      { headers: { 'Cache-Control': 'private, no-store' } },
    );
  } catch (e) {
    return errorResponse(e);
  }
}
