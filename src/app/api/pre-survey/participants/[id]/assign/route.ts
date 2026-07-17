import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { requireRole } from '@/lib/rbac';
import { errorResponse } from '@/lib/api';
import { writeAuditLog, extractRequestMeta } from '@/lib/audit-log';
import { SURVEY_COMMITTEE_TYPES } from '@/lib/types';

const Body = z.object({
  // UAT 圖28:每場次指派可帶構面(管理面/策略面/技術面/管理面-OT;說明會等免構面=null)
  assignments: z
    .array(z.object({ sessionId: z.string().min(1), aspect: z.enum(SURVEY_COMMITTEE_TYPES).nullable().optional() }))
    .max(50)
    .optional(),
  // 舊形狀(無構面)向後相容
  sessionIds: z.array(z.string().min(1)).max(50).optional(),
});

/**
 * 指派某受調人員的「最終場次」(批A;僅中心)。以整組覆寫 SurveyFinalAssignment:
 * 傳入集合外的既有指派刪除、集合內新的建立。指派 ≥1 場即解鎖該人二階(差旅/飲食,批B)。
 * 場次須同年度(防跨年度誤指派)。
 */
export async function PUT(req: Request, { params }: { params: { id: string } }) {
  try {
    const user = await requireRole('SUPER_ADMIN');
    const body = Body.parse(await req.json());

    const participant = await prisma.surveyParticipant.findUnique({
      where: { id: params.id },
      select: { id: true, year: true, kind: true, userId: true },
    });
    if (!participant) return NextResponse.json({ error: '受調人員不存在' }, { status: 404 });

    // 統一為 [{ sessionId, aspect }](assignments 優先;sessionIds 相容=無構面);同場次去重取先者
    const rawEntries =
      body.assignments ?? (body.sessionIds ?? []).map((sessionId) => ({ sessionId, aspect: null as string | null }));
    const entries = rawEntries.filter(
      (e, i) => rawEntries.findIndex((x) => x.sessionId === e.sessionId) === i,
    );
    const wanted = entries.map((e) => e.sessionId);
    if (wanted.length > 0) {
      // D 防禦縱深:觀察員不得被指派到「委員專屬」場次(sharedWithObserver=false),與自助頁/達標卡排除一致。
      const where =
        participant.kind === 'OBSERVER'
          ? { id: { in: wanted }, year: participant.year, sharedWithObserver: true }
          : { id: { in: wanted }, year: participant.year };
      const valid = await prisma.surveySession.count({ where });
      if (valid !== wanted.length) {
        return NextResponse.json(
          {
            error:
              participant.kind === 'OBSERVER'
                ? '含不存在、非此年度、或委員專屬（不開放觀察員）的場次'
                : '含不存在或非此年度的場次',
          },
          { status: 400 },
        );
      }
    }

    await prisma.$transaction(async (tx) => {
      await tx.surveyFinalAssignment.deleteMany({
        where: { participantId: participant.id, sessionId: { notIn: wanted.length ? wanted : ['__none__'] } },
      });
      // upsert 逐筆(≤50):新指派帶構面建立、既有指派更新構面(UAT 圖28);並發冪等(@@unique 保證不重複)
      for (const e of entries) {
        await tx.surveyFinalAssignment.upsert({
          where: { participantId_sessionId: { participantId: participant.id, sessionId: e.sessionId } },
          create: { participantId: participant.id, sessionId: e.sessionId, aspect: e.aspect ?? null, assignedById: user.id },
          update: { aspect: e.aspect ?? null },
        });
      }
    });

    // UAT 圖37:帶入場次(sourceCycleId)指派後,連動稽核週期——
    //  - 委員:自動加入該週期「稽核委員指派」(AuditorAssignment;場次構面→負責構面 dimensions 聯集;
    //    已指派者僅補構面)。COI:服務該機關(現職或有效授權)者跳過並回報。
    //  - 觀察員:CycleObserver 配對必填指導委員(mentorId),無法自動——回應提示至週期進階設定配對。
    //  - 僅做「加入」連動;自調查移除場次不反向移除週期指派(避免誤刪已有評分/審閱紀錄的指派)。
    const SURVEY_TO_ASSIGN: Record<string, string> = {
      管理面: 'MANAGEMENT',
      策略面: 'STRATEGY',
      技術面: 'TECHNICAL',
      '管理面-OT': 'MANAGEMENT_OT',
    };
    const linkedCycles: string[] = [];
    const skippedCoi: string[] = [];
    let observerHint = false;
    const srcSessions = wanted.length
      ? await prisma.surveySession.findMany({
          where: { id: { in: wanted }, sourceCycleId: { not: null } },
          select: { id: true, sourceCycleId: true },
        })
      : [];
    if (srcSessions.length > 0) {
      if (participant.kind === 'MEMBER') {
        const [pUser, grants, cycles] = await Promise.all([
          prisma.user.findUnique({ where: { id: participant.userId }, select: { organizationId: true } }),
          prisma.userRole.findMany({
            where: { userId: participant.userId, endedAt: null, organizationId: { not: null } },
            select: { organizationId: true },
          }),
          prisma.auditCycle.findMany({
            where: { id: { in: srcSessions.map((s) => s.sourceCycleId as string) } },
            select: { id: true, organizationId: true, organization: { select: { name: true, shortName: true } } },
          }),
        ]);
        const servedOrgIds = new Set(
          [pUser?.organizationId, ...grants.map((g) => g.organizationId)].filter(Boolean) as string[],
        );
        const aspectByCycle = new Map(
          srcSessions.map((s) => [s.sourceCycleId as string, entries.find((e) => e.sessionId === s.id)?.aspect ?? null]),
        );
        for (const c of cycles) {
          const orgLabel = c.organization.shortName ?? c.organization.name;
          if (servedOrgIds.has(c.organizationId)) {
            skippedCoi.push(orgLabel);
            continue;
          }
          const mapped = SURVEY_TO_ASSIGN[aspectByCycle.get(c.id) ?? ''] ?? null;
          const existingAssign = await prisma.auditorAssignment.findUnique({
            where: { cycleId_auditorId: { cycleId: c.id, auditorId: participant.userId } },
            select: { id: true, dimensions: true },
          });
          if (!existingAssign) {
            await prisma.auditorAssignment.create({
              data: {
                cycleId: c.id,
                auditorId: participant.userId,
                dimensions: mapped ? JSON.stringify([mapped]) : null,
              },
            });
            linkedCycles.push(orgLabel);
          } else if (mapped) {
            let cur: string[] = [];
            try {
              const a = JSON.parse(existingAssign.dimensions ?? '[]');
              cur = Array.isArray(a) ? a.filter((x): x is string => typeof x === 'string') : [];
            } catch {
              cur = [];
            }
            if (!cur.includes(mapped)) {
              await prisma.auditorAssignment.update({
                where: { id: existingAssign.id },
                data: { dimensions: JSON.stringify([...cur, mapped]) },
              });
              linkedCycles.push(`${orgLabel}（補構面）`);
            }
          }
        }
      } else {
        observerHint = true;
      }
    }

    await writeAuditLog({
      actorId: user.id,
      action: 'SURVEY_FINAL_ASSIGN',
      entityType: 'SurveyParticipant',
      entityId: participant.id,
      after: { assignments: entries, linkedCycles, skippedCoi },
      ...extractRequestMeta(req),
    });

    return NextResponse.json({ ok: true, linkedCycles, skippedCoi, observerHint });
  } catch (e) {
    return errorResponse(e);
  }
}
