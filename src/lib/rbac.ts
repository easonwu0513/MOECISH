import { EVIDENCE_TARGET_TYPES, type EvidenceTargetType, type Role, auditorCanSeePrep, auditorCanViewChecklistContent, auditorCanSeeCycle } from './types';
import { auth } from './auth';
import { prisma } from './db';

export class AuthError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

export async function requireUser() {
  const session = await auth();
  // 檢查 user.id 而非僅 user 物件:token 被撤銷(改密/停權)時 callback 會清空 claims
  if (!session?.user?.id) throw new AuthError(401, '未登入');
  return session.user;
}

export async function requireRole(...roles: Role[]) {
  const user = await requireUser();
  if (!roles.includes(user.role)) throw new AuthError(403, '權限不足');
  return user;
}

/**
 * 週期存取控制：
 * - SUPER_ADMIN：全部
 * - AUDITOR：限被指派之週期（assignments）
 * - ORG_ADMIN：限自家機關之週期
 */
export async function assertCycleAccess(cycleId: string) {
  const user = await requireUser();
  const cycle = await prisma.auditCycle.findUnique({
    where: { id: cycleId },
    include: { assignments: true },
  });
  if (!cycle) throw new AuthError(404, '稽核週期不存在');

  switch (user.role) {
    case 'SUPER_ADMIN':
      break;
    case 'AUDITOR': {
      const assigned = cycle.assignments.some((a) => a.auditorId === user.id);
      if (!assigned) throw new AuthError(403, '您未被指派此稽核週期');
      // 開立中(DRAFT)委員尚不可存取(中心仍在調整委員名單);PREPARATION 起才開放。
      // 中心指派/抽換委員不經此閘(assignments API 為 SUPER_ADMIN-only、無階段限制)。
      if (!auditorCanSeeCycle(cycle.status)) {
        throw new AuthError(403, '此稽核週期尚在開立中,待中心開始資料準備後才開放委員存取');
      }
      break;
    }
    case 'ORG_ADMIN':
      if (cycle.organizationId !== user.organizationId) {
        throw new AuthError(403, '不可存取他機關的稽核週期');
      }
      break;
  }
  return { user, cycle };
}

/**
 * 委員「確認填寫完畢」鎖定後,其評分/發現編輯一律擋下(防繞過 UI 直打 API)。
 * SUPER_ADMIN 不受此限(管理員可覆核);僅對委員本人的鎖定生效。
 */
export async function assertAuditorScoreUnlocked(cycleId: string, auditorId: string) {
  const a = await prisma.auditorAssignment.findUnique({
    where: { cycleId_auditorId: { cycleId, auditorId } },
    select: { scoreLockedAt: true },
  });
  if (a?.scoreLockedAt) {
    throw new AuthError(409, '已確認填寫完畢,如需修改請先解除鎖定');
  }
}

/**
 * 缺失存取控制（連同所屬週期一起驗證），回傳 user + deficiency(含 cycle/action)。
 */
export async function assertDeficiencyAccess(deficiencyId: string) {
  const user = await requireUser();
  const deficiency = await prisma.deficiency.findUnique({
    where: { id: deficiencyId },
    include: {
      cycle: { include: { assignments: true } },
      action: { include: { reviews: { orderBy: { decidedAt: 'asc' } } } },
    },
  });
  if (!deficiency) throw new AuthError(404, '缺失不存在');

  const cycle = deficiency.cycle;
  switch (user.role) {
    case 'SUPER_ADMIN':
      break;
    case 'AUDITOR': {
      const assigned = cycle.assignments.some((a) => a.auditorId === user.id);
      if (!assigned) throw new AuthError(403, '您未被指派此稽核週期');
      break;
    }
    case 'ORG_ADMIN':
      if (cycle.organizationId !== user.organizationId) {
        throw new AuthError(403, '不可存取他機關的資料');
      }
      break;
  }
  return { user, deficiency };
}

/**
 * 佐證存取控制:依 targetType 反查所屬週期,再套週期存取規則
 * (SUPER_ADMIN 全部 / AUDITOR 限被指派 / ORG_ADMIN 限自家機關)。
 * 用於佐證的 list / upload / download — 杜絕跨機關 IDOR。
 * targetId 格式不符或對象不存在一律擋下。
 */
export async function assertEvidenceAccess(targetType: string, targetId: string) {
  if (!EVIDENCE_TARGET_TYPES.includes(targetType as EvidenceTargetType)) {
    throw new AuthError(400, '不支援的佐證類型');
  }
  if (!/^[a-z0-9]{20,40}$/i.test(targetId)) {
    // cuid 形式;阻擋路徑穿越與任意字串
    throw new AuthError(400, '佐證對象識別碼格式不正確');
  }

  let cycleId: string | null = null;
  switch (targetType as EvidenceTargetType) {
    case 'AUDIT_CYCLE':
      cycleId = targetId;
      break;
    case 'CHECKLIST_RESPONSE': {
      const r = await prisma.checklistResponse.findUnique({
        where: { id: targetId }, select: { cycleId: true },
      });
      cycleId = r?.cycleId ?? null;
      break;
    }
    case 'CORRECTIVE_ACTION': {
      const a = await prisma.correctiveAction.findUnique({
        where: { id: targetId }, select: { deficiency: { select: { cycleId: true } } },
      });
      cycleId = a?.deficiency.cycleId ?? null;
      break;
    }
    case 'PREP_SUBMISSION': {
      const s = await prisma.prepSubmission.findUnique({
        where: { id: targetId }, select: { requirement: { select: { cycleId: true } } },
      });
      cycleId = s?.requirement.cycleId ?? null;
      break;
    }
  }
  if (!cycleId) throw new AuthError(404, '佐證對象不存在');

  const { user, cycle } = await assertCycleAccess(cycleId);

  // 資料準備佐證:委員僅能存取中心已確認齊備之機關區、或中心匯入區已有檔者(API 層強制,非僅畫面過濾)
  if (targetType === 'PREP_SUBMISSION' && user.role === 'AUDITOR') {
    const sub = await prisma.prepSubmission.findUnique({
      where: { id: targetId },
      select: { status: true, requirement: { select: { category: true } } },
    });
    const fileCount = await prisma.evidence.count({ where: { targetType: 'PREP_SUBMISSION', targetId } });
    if (!sub || !auditorCanSeePrep(sub.status, sub.requirement.category, fileCount > 0, cycle.status)) {
      throw new AuthError(403, '此資料尚未開放委員檢視');
    }
  }

  // 機關檢核表佐證:委員一律於週期進入「資料齊備」後才可列出/下載(與 prep 同分界;擋 PREPARATION 直打 API 偷看)
  if (targetType === 'CHECKLIST_RESPONSE' && user.role === 'AUDITOR' && !auditorCanViewChecklistContent(cycle.status)) {
    throw new AuthError(403, '資料準備階段尚未開放委員檢視機關檢核表佐證');
  }

  // 中心匯入區(CENTER)僅供委員審閱,受稽機關不可讀取/下載(後端權威阻擋,非僅畫面過濾)
  if (targetType === 'PREP_SUBMISSION' && user.role === 'ORG_ADMIN') {
    const sub = await prisma.prepSubmission.findUnique({
      where: { id: targetId },
      select: { requirement: { select: { category: true } } },
    });
    if (sub?.requirement.category === 'CENTER') {
      throw new AuthError(403, '中心匯入區資料僅供委員審閱,機關無法存取');
    }
  }

  return { user, cycle, cycleId };
}
