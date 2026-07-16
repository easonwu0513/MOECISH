import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { assertCycleAccess, assertAuditorScoreUnlocked } from '@/lib/rbac';
import { errorResponse } from '@/lib/api';
import { DEFICIENCY_ASPECTS, auditorCanScore } from '@/lib/types';
import { FINDING_KINDS } from '@/lib/audit-score';
import { writeAuditLog, extractRequestMeta } from '@/lib/audit-log';

const CreateBody = z.object({
  aspect: z.enum(DEFICIENCY_ASPECTS),
  kind: z.enum(FINDING_KINDS),
  content: z.string().trim().min(5, '發現內容至少 5 字'),
  checklistRef: z.string().trim().optional(),
});

/** 受指派委員新增一條稽核發現。 */
export async function POST(req: Request, { params }: { params: { id: string } }) {
  try {
    const { user, cycle } = await assertCycleAccess(params.id);
    if (user.role !== 'AUDITOR') {
      return NextResponse.json({ error: '僅稽核委員可輸入稽核發現' }, { status: 403 });
    }
    if (cycle.status === 'CLOSED') {
      return NextResponse.json({ error: '已結案的週期不可再輸入' }, { status: 409 });
    }
    // 階段閘下沉 API 層(縱深防禦):實地稽核(ONSITE 起)才可記錄稽核發現(封 READY 繞頁面直打之破口)。
    if (!auditorCanScore(cycle.status)) {
      return NextResponse.json({ error: '尚未進入實地稽核階段，暫不可記錄稽核發現' }, { status: 403 });
    }
    await assertAuditorScoreUnlocked(cycle.id, user.id); // 已鎖定 → 擋下

    const body = CreateBody.parse(await req.json());
    const finding = await prisma.auditFinding.create({
      data: {
        cycleId: cycle.id,
        auditorId: user.id,
        aspect: body.aspect,
        kind: body.kind,
        content: body.content,
        checklistRef: body.checklistRef || null,
      },
    });

    await writeAuditLog({
      actorId: user.id,
      action: 'audit.finding.create',
      entityType: 'AuditFinding',
      entityId: finding.id,
      after: { aspect: body.aspect, kind: body.kind },
      ...extractRequestMeta(req),
    });

    return NextResponse.json(finding, { status: 201 });
  } catch (e) {
    return errorResponse(e);
  }
}
