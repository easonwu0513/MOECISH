import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { requireRole } from '@/lib/rbac';
import { errorResponse } from '@/lib/api';
import { writeAuditLog, extractRequestMeta } from '@/lib/audit-log';
import { assertSurveyYearWritable } from '@/lib/pre-survey-server';
import { linkMemberToCycles, linkObserverToCycles } from '@/lib/pre-survey-linkage';

const Body = z.object({ year: z.number().int().min(2000).max(2200) });

/**
 * P2:帶入的反向操作——移除本年度「由週期帶入且尚無任何意願/指派」的場次(對稱既有一鍵帶入)。
 * 已有受調者填意願或已指派者一律保留(不刪有作業痕跡的場次),回報保留數供中心判斷。
 */
export async function DELETE(req: Request) {
  try {
    const user = await requireRole('SUPER_ADMIN');
    const { year } = Body.parse(await req.json());
    assertSurveyYearWritable(year); // UAT 圖57:歷年資料唯讀

    // 對抗審查:①只刪「長得就是 import 產物」的場次——補標(圖37)會把手動建立的場次也寫上
    // sourceCycleId,若僅以此為據會誤刪中心手動建立並自訂過的場次(備註/必參加/目標人數皆為預設才刪);
    // ②條件全部下沉到 deleteMany 的 where(DB 端評估),避免 read-then-delete 空窗把剛送出的意願 cascade 掉。
    const IMPORT_SHAPE = {
      year,
      sourceCycleId: { not: null },
      isBriefing: false,
      remark: null,
      isRequired: false,
      targetMemberCount: 0,
      targetObserverCount: 0,
    } as const;
    const candidates = await prisma.surveySession.findMany({
      where: { year, sourceCycleId: { not: null }, isBriefing: false },
      select: { name: true, _count: { select: { availabilities: true, finalAssignments: true } } },
    });
    const { count: removed } = await prisma.surveySession.deleteMany({
      where: { ...IMPORT_SHAPE, availabilities: { none: {} }, finalAssignments: { none: {} } },
    });
    const kept = candidates.length - removed;

    await writeAuditLog({
      actorId: user.id,
      action: 'SURVEY_SESSION_IMPORT_UNDO',
      entityType: 'SurveySession',
      entityId: String(year),
      after: { removed, kept, candidates: candidates.map((s) => s.name) },
      ...extractRequestMeta(req),
    });

    return NextResponse.json({ removed, kept });
  } catch (e) {
    return errorResponse(e);
  }
}

/**
 * 帶入當年度稽核場次(UAT;僅中心)。把該年度「已排定實地稽核日」的稽核週期,建成事前場次調查場次:
 *   日期＝實地稽核日(onsiteDate)、名稱＝受稽機關(shortName ?? name)。
 * 去重:同年度已存在「同名稱＋同日期」的場次則略過(可重複點擊、與手動新增並存)。
 */
export async function POST(req: Request) {
  try {
    const user = await requireRole('SUPER_ADMIN');
    const { year } = Body.parse(await req.json());
    assertSurveyYearWritable(year); // UAT 圖57:歷年資料唯讀

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

    // UAT 圖37/49:補標完成後,對剛補標場次上「已存在的指派」直接觸發週期連動
    // (使用者先前已按過儲存指派——不需重存;連動核心與 assign route 共用,行為一致):
    //  - 委員 → 週期稽核委員指派;觀察員 → 週期觀察員配對(指導委員待設定)。
    const linkedCycles: string[] = [];
    const skippedCoi: string[] = [];
    const skippedOther: string[] = [];
    let observerHint = false;
    if (backfilled.length > 0) {
      const cycleBySession = new Map(backfilled.map((b) => [b.sessionId, b.cycleId]));
      const assigns = await prisma.surveyFinalAssignment.findMany({
        where: { sessionId: { in: backfilled.map((b) => b.sessionId) } },
        select: { sessionId: true, aspect: true, participant: { select: { kind: true, userId: true } } },
      });
      const byMember = new Map<string, Array<{ cycleId: string; aspect: string | null }>>();
      const byObserver = new Map<string, Array<{ cycleId: string; aspect: string | null }>>();
      for (const a of assigns) {
        const cycleId = cycleBySession.get(a.sessionId);
        if (!cycleId) continue;
        const bucket = a.participant.kind === 'MEMBER' ? byMember : byObserver;
        bucket.set(a.participant.userId, [...(bucket.get(a.participant.userId) ?? []), { cycleId, aspect: a.aspect }]);
      }
      for (const [userId, items] of byMember) {
        const linked = await linkMemberToCycles(userId, items);
        linkedCycles.push(...linked.linkedCycles);
        skippedCoi.push(...linked.skippedCoi);
        skippedOther.push(...linked.skippedOther);
      }
      for (const [userId, items] of byObserver) {
        const linked = await linkObserverToCycles(userId, items);
        linkedCycles.push(...linked.linkedCycles.map((l) => `${l}（觀察員）`));
        skippedCoi.push(...linked.skippedCoi.map((l) => `${l}（觀察員）`));
        skippedOther.push(...linked.skippedOther);
        if (linked.created > 0) observerHint = true;
      }
    }

    await writeAuditLog({
      actorId: user.id,
      action: 'SURVEY_SESSION_IMPORT_CYCLES',
      entityType: 'SurveySession',
      entityId: String(year),
      after: { year, created, skipped, backfilled: backfilled.length, linkedCycles, skippedCoi, skippedOther },
      ...extractRequestMeta(req),
    });

    return NextResponse.json({
      created, skipped, backfilled: backfilled.length, linkedCycles, skippedCoi, skippedOther, observerHint,
    });
  } catch (e) {
    return errorResponse(e);
  }
}
