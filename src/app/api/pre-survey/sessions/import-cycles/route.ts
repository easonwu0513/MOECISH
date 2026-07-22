import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { requireRole } from '@/lib/rbac';
import { errorResponse } from '@/lib/api';
import { writeAuditLog, extractRequestMeta } from '@/lib/audit-log';
import { linkMemberToCycles } from '@/lib/pre-survey-linkage';

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
      select: { id: true, name: true, date: true, orderIndex: true, sourceCycleId: true, isBriefing: true },
    });
    // UAT 圖13/37 冪等補標(兩段式):
    //  ① 名稱匹配:「場次名=機關名」即補 sourceCycleId 並把日期對齊實地稽核日(不要求日期相同)。
    //  ② 日期後援:名稱對不上(場次名為場地名等)時,若該日期「恰有一個週期、恰有一個未補標的
    //     非說明會場次」→ 以日期唯一對應補標(不動名稱;模糊或撞期即不補,fail-safe 不誤配)。
    const byName = new Map(existing.map((s) => [s.name, s]));
    const cyclesPerDate = new Map<number, number>();
    for (const c of cycles) {
      if (c.onsiteDate) cyclesPerDate.set(c.onsiteDate.getTime(), (cyclesPerDate.get(c.onsiteDate.getTime()) ?? 0) + 1);
    }
    const candidatesByDate = new Map<number, string[]>();
    for (const s of existing) {
      if (!s.sourceCycleId && !s.isBriefing && s.date) {
        const t = s.date.getTime();
        candidatesByDate.set(t, [...(candidatesByDate.get(t) ?? []), s.id]);
      }
    }
    const consumeCandidate = (sessionId: string) => {
      for (const [t, ids] of candidatesByDate) {
        if (ids.includes(sessionId)) candidatesByDate.set(t, ids.filter((id) => id !== sessionId));
      }
    };
    let nextOrder = existing.reduce((m, s) => Math.max(m, s.orderIndex), -1) + 1;

    let created = 0;
    let skipped = 0;
    // 本次「剛補上 sourceCycleId」的場次(含名稱與日期兩種匹配)→ 觸發既有指派的週期連動
    const backfilled: Array<{ sessionId: string; cycleId: string }> = [];
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
        if (patch.sourceCycleId) {
          backfilled.push({ sessionId: match.id, cycleId: c.id });
          consumeCandidate(match.id);
        }
        skipped += 1;
        continue;
      }
      // ② 日期後援(名稱對不上時)
      if (c.onsiteDate && cyclesPerDate.get(c.onsiteDate.getTime()) === 1) {
        const cands = candidatesByDate.get(c.onsiteDate.getTime()) ?? [];
        if (cands.length === 1) {
          await prisma.surveySession.update({ where: { id: cands[0] }, data: { sourceCycleId: c.id } });
          backfilled.push({ sessionId: cands[0], cycleId: c.id });
          consumeCandidate(cands[0]);
          skipped += 1;
          continue;
        }
      }
      const s = await prisma.surveySession.create({
        data: { year, name, date: c.onsiteDate, sourceCycleId: c.id, createdById: user.id, orderIndex: nextOrder },
      });
      byName.set(name, { id: s.id, name, date: c.onsiteDate, orderIndex: nextOrder, sourceCycleId: c.id, isBriefing: false });
      nextOrder += 1;
      created += 1;
    }

    // UAT 圖37:補標完成後,對剛補標場次上「已存在的委員指派」直接觸發週期連動
    // (使用者先前已按過儲存指派——不需重存;連動核心與 assign route 共用,行為一致)。
    const linkedCycles: string[] = [];
    const skippedCoi: string[] = [];
    let observerHint = false;
    if (backfilled.length > 0) {
      const cycleBySession = new Map(backfilled.map((b) => [b.sessionId, b.cycleId]));
      const assigns = await prisma.surveyFinalAssignment.findMany({
        where: { sessionId: { in: backfilled.map((b) => b.sessionId) } },
        select: { sessionId: true, aspect: true, participant: { select: { kind: true, userId: true } } },
      });
      const byUser = new Map<string, Array<{ cycleId: string; aspect: string | null }>>();
      for (const a of assigns) {
        if (a.participant.kind !== 'MEMBER') {
          observerHint = true;
          continue;
        }
        const cycleId = cycleBySession.get(a.sessionId);
        if (!cycleId) continue;
        byUser.set(a.participant.userId, [...(byUser.get(a.participant.userId) ?? []), { cycleId, aspect: a.aspect }]);
      }
      for (const [userId, items] of byUser) {
        const linked = await linkMemberToCycles(userId, items);
        linkedCycles.push(...linked.linkedCycles);
        skippedCoi.push(...linked.skippedCoi);
      }
    }

    await writeAuditLog({
      actorId: user.id,
      action: 'SURVEY_SESSION_IMPORT_CYCLES',
      entityType: 'SurveySession',
      entityId: String(year),
      after: { year, created, skipped, backfilled: backfilled.length, linkedCycles, skippedCoi },
      ...extractRequestMeta(req),
    });

    return NextResponse.json({ created, skipped, backfilled: backfilled.length, linkedCycles, skippedCoi, observerHint });
  } catch (e) {
    return errorResponse(e);
  }
}
