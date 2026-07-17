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
    const keyOf = (name: string, date: Date | null) => `${name}|${date ? date.toISOString() : ''}`;
    const existKey = new Map(existing.map((s) => [keyOf(s.name, s.date), s]));
    let nextOrder = existing.reduce((m, s) => Math.max(m, s.orderIndex), -1) + 1;

    let created = 0;
    let skipped = 0;
    for (const c of cycles) {
      const name = c.organization.shortName ?? c.organization.name;
      const key = keyOf(name, c.onsiteDate);
      const match = existKey.get(key);
      if (match) {
        // UAT 圖13 冪等補標:sourceCycleId 欄位加入前帶入的舊場次,匹配到即補來源(使日期鎖定/連動生效)
        if (!match.sourceCycleId) {
          await prisma.surveySession.update({ where: { id: match.id }, data: { sourceCycleId: c.id } });
        }
        skipped += 1;
        continue;
      }
      const s = await prisma.surveySession.create({
        data: { year, name, date: c.onsiteDate, sourceCycleId: c.id, createdById: user.id, orderIndex: nextOrder },
      });
      existKey.set(key, { id: s.id, name, date: c.onsiteDate, orderIndex: nextOrder, sourceCycleId: c.id });
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
