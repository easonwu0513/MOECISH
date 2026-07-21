import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { requireRole } from '@/lib/rbac';
import { errorResponse } from '@/lib/api';
import { writeAuditLog, extractRequestMeta } from '@/lib/audit-log';

const Body = z.object({ year: z.number().int().min(2000).max(2200) });

/**
 * 帶入當年度稽核場次(UAT;僅中心)。把該年度「已排定實地稽核日」的稽核週期,建成事前場次調查場次:
 *   日期＝實地稽核日(onsiteDate)、名稱＝受稽機關(shortName ?? name)。
 * 去重:同年度已存在「同名稱＋同日期」的場次則略過(可重複點擊、與手動新增並存)。
 */
export async function POST(req: Request) {
  try {
    const user = await requireRole('SUPER_ADMIN');
    const { year } = Body.parse(await req.json());

    const cycles = await prisma.auditCycle.findMany({
      where: { year, onsiteDate: { not: null } },
      select: { id: true, onsiteDate: true, organization: { select: { name: true, shortName: true } } },
      orderBy: { onsiteDate: 'asc' },
    });
    if (cycles.length === 0) {
      return NextResponse.json({ created: 0, skipped: 0, message: '本年度尚無已排定實地稽核日的稽核週期。' });
    }

    const existing = await prisma.surveySession.findMany({
      where: { year },
      select: { id: true, name: true, date: true, orderIndex: true, sourceCycleId: true },
    });
    // UAT 圖13/37 冪等補標(寬鬆化):以「場次名=機關名」匹配(不要求日期相同——舊場次日期可能
    // 已被中心改過);匹配到即補 sourceCycleId 並把日期對齊週期實地稽核日(圖13 連動語意),
    // 使日期鎖定與週期指派連動(圖37)對「補標前帶入的舊場次」也生效。
    const byName = new Map(existing.map((s) => [s.name, s]));
    let nextOrder = existing.reduce((m, s) => Math.max(m, s.orderIndex), -1) + 1;

    let created = 0;
    let skipped = 0;
    for (const c of cycles) {
      const name = c.organization.shortName ?? c.organization.name;
      const match = byName.get(name) ?? byName.get(c.organization.name);
      if (match) {
        const patch: { sourceCycleId?: string; date?: Date | null } = {};
        if (!match.sourceCycleId) patch.sourceCycleId = c.id;
        if (match.sourceCycleId === null || match.sourceCycleId === c.id) {
          // 僅對「本週期來源(或剛補標)」的場次對齊日期,避免改到同名異源場次
          if ((match.date?.getTime() ?? null) !== (c.onsiteDate?.getTime() ?? null)) patch.date = c.onsiteDate;
        }
        if (Object.keys(patch).length > 0) {
          await prisma.surveySession.update({ where: { id: match.id }, data: patch });
        }
        skipped += 1;
        continue;
      }
      const s = await prisma.surveySession.create({
        data: { year, name, date: c.onsiteDate, sourceCycleId: c.id, createdById: user.id, orderIndex: nextOrder },
      });
      byName.set(name, { id: s.id, name, date: c.onsiteDate, orderIndex: nextOrder, sourceCycleId: c.id });
      nextOrder += 1;
      created += 1;
    }

    await writeAuditLog({
      actorId: user.id,
      action: 'SURVEY_SESSION_IMPORT_CYCLES',
      entityType: 'SurveySession',
      entityId: String(year),
      after: { year, created, skipped },
      ...extractRequestMeta(req),
    });

    return NextResponse.json({ created, skipped });
  } catch (e) {
    return errorResponse(e);
  }
}
