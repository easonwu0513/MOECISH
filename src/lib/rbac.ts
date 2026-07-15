import { EVIDENCE_TARGET_TYPES, type EvidenceTargetType, type Role, auditorCanSeePrep, auditorCanViewChecklistContent, auditorCanSeeCycle, auditorCanScore, reviewWindowOpenForRole } from './types';
import { canAccess } from './access-policy';
import { holdsActiveRole } from './identity';
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
 * - OBSERVER：限被配對之週期（CycleObserver;批30）
 * - ORG_ADMIN：限自家機關之週期
 * ⚠️ switch 必留 default deny:未知角色一律 403(批30 前對未知角色 fail-open,已收斂)。
 */
export async function assertCycleAccess(cycleId: string, opts?: { allowClosed?: boolean }) {
  const user = await requireUser();
  const cycle = await prisma.auditCycle.findUnique({
    where: { id: cycleId },
    include: { assignments: true },
  });
  if (!cycle) throw new AuthError(404, '稽核週期不存在');

  // 練習模組(批49 圖2)結案後仍開放觀察員/指導委員存取:allowClosed 時只擋 DRAFT、放行 CLOSED
  //(練習資料結構性隔離,不影響正式結果);其餘呼叫端維持 DRAFT+CLOSED 皆擋。
  const canSee = (status: (typeof cycle)['status']) =>
    opts?.allowClosed ? status !== 'DRAFT' : auditorCanSeeCycle(status);

  switch (user.role) {
    case 'SUPER_ADMIN':
      break;
    case 'AUDITOR': {
      const assigned = cycle.assignments.some((a) => a.auditorId === user.id);
      if (!assigned) throw new AuthError(403, '您未被指派此稽核週期');
      // 開立中(DRAFT)委員尚不可存取(中心仍在調整委員名單);PREPARATION 起才開放。
      // 中心指派/抽換委員不經此閘(assignments API 為 SUPER_ADMIN-only、無階段限制)。
      if (!canSee(cycle.status)) {
        throw new AuthError(403, '此稽核週期尚在開立中，待中心開始資料準備後才開放委員存取');
      }
      break;
    }
    case 'OBSERVER': {
      // 觀察員限被配對之週期(CycleObserver,非 assignments);階段閘與委員一致(DRAFT 不可見);
      // 練習模組另以 allowClosed 於結案後仍放行(批49 圖2)。
      const paired = await prisma.cycleObserver.findUnique({
        where: { cycleId_observerId: { cycleId: cycle.id, observerId: user.id } },
        select: { id: true },
      });
      if (!paired) throw new AuthError(403, '您未被配對至此稽核週期');
      if (!canSee(cycle.status)) {
        throw new AuthError(403, '此稽核週期尚在開立中，待中心開始資料準備後才開放存取');
      }
      break;
    }
    case 'ORG_ADMIN':
      if (cycle.organizationId !== user.organizationId) {
        throw new AuthError(403, '不可存取他機關的稽核週期');
      }
      break;
    default:
      throw new AuthError(403, '權限不足');
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
    throw new AuthError(409, '已確認填寫完畢，如需修改請先解除鎖定');
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
    default:
      // 觀察員不開放「缺失與矯正管考」(需求一-2);其餘未知角色一律拒絕。
      throw new AuthError(403, '權限不足');
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

  // 持續列管回報佐證(批71):跨年度、不綁週期階段,不能走 assertCycleAccess(來源週期多已結案、
  // 協審委員亦不在原週期指派表)。改以列管項的機關/協審委員自訂授權,並回傳來源週期供浮水印/軌跡定址。
  //  ・中心(SUPER_ADMIN):全可;  ・機關(ORG_ADMIN):限自家列管項(含多重身分授權);
  //  ・協審委員(AUDITOR):限被指派該項者,唯讀(寫入由 evidences POST 全域擋委員);其餘一律拒絕。
  if (targetType === 'TRACKED_REPORT') {
    const user = await requireUser();
    const report = await prisma.trackedReport.findUnique({
      where: { id: targetId },
      select: { tracked: { select: { organizationId: true, assignedAuditorId: true, originCycleId: true } } },
    });
    if (!report) throw new AuthError(404, '佐證對象不存在');
    const t = report.tracked;
    let allowed = false;
    if (user.role === 'SUPER_ADMIN') {
      allowed = true;
    } else if (user.role === 'ORG_ADMIN') {
      allowed = user.organizationId === t.organizationId || (await holdsActiveRole(user.id, 'ORG_ADMIN', t.organizationId));
    } else if (user.role === 'AUDITOR') {
      allowed = t.assignedAuditorId === user.id;
    }
    if (!allowed) throw new AuthError(403, '無權存取此持續列管回報的佐證');
    const cycle = await prisma.auditCycle.findUnique({ where: { id: t.originCycleId } });
    if (!cycle) throw new AuthError(404, '佐證對象不存在');
    return { user, cycle, cycleId: cycle.id };
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

  // 觀察員(批30):僅開放「線上審閱」相關佐證(資料準備 PREP_SUBMISSION + 檢核表 CHECKLIST_RESPONSE);
  // 缺失佐證(CORRECTIVE_ACTION,矯正管考模組不開放=需求一-2)與週期層級佐證(AUDIT_CYCLE)一律拒絕。
  if (user.role === 'OBSERVER' && targetType !== 'PREP_SUBMISSION' && targetType !== 'CHECKLIST_RESPONSE') {
    throw new AuthError(403, '觀察員不開放此類佐證');
  }

  // 委員/觀察員審閱時間區間(UAT 批67;觀察員批30 用獨立窗口):資料準備 + 機關檢核表佐證,僅在中心設定的
  // 審閱時段內可存取(API 層權威閘,非僅畫面鎖定);未設區間一律不開放。缺失佐證(CORRECTIVE_ACTION)屬矯正階段、
  // 不在審閱窗口管制範圍。
  // 例外(批67 裁定「審閱窗口只管 prep+檢核表審閱、不管實地稽核」):進入實地稽核(ONSITE 起)後,
  // 委員於評分工作台(AuditPad)/觀察員於練習工作台需就地檢視機關檢核表佐證——此屬「實地稽核」非「線上審閱」,
  // 故不再受審閱窗口限制。僅豁免 CHECKLIST_RESPONSE;PREP_SUBMISSION 仍受窗口管制。
  const windowExemptForScoring =
    targetType === 'CHECKLIST_RESPONSE' &&
    (user.role === 'AUDITOR' ? auditorCanScore(cycle.status) : canAccess('practice.access', 'OBSERVER', cycle.status));
  if (
    (user.role === 'AUDITOR' || user.role === 'OBSERVER') &&
    (targetType === 'PREP_SUBMISSION' || targetType === 'CHECKLIST_RESPONSE') &&
    !windowExemptForScoring &&
    !reviewWindowOpenForRole(user.role, cycle)
  ) {
    throw new AuthError(403, '目前不在審閱時間區間內，暫不開放檢視機關資料');
  }

  // 資料準備佐證:委員/觀察員僅能存取中心已確認齊備之機關區、或中心匯入區已有檔者(API 層強制,非僅畫面過濾)
  if (targetType === 'PREP_SUBMISSION' && (user.role === 'AUDITOR' || user.role === 'OBSERVER')) {
    const sub = await prisma.prepSubmission.findUnique({
      where: { id: targetId },
      select: { status: true, requirement: { select: { category: true } } },
    });
    const fileCount = await prisma.evidence.count({ where: { targetType: 'PREP_SUBMISSION', targetId } });
    if (!sub || !auditorCanSeePrep(sub.status, sub.requirement.category, fileCount > 0, cycle.status)) {
      throw new AuthError(403, '此資料尚未開放檢視');
    }
  }

  // 機關檢核表佐證:委員/觀察員一律於週期進入「資料齊備」後才可列出/下載(與 prep 同分界;擋 PREPARATION 直打 API 偷看)
  if (
    targetType === 'CHECKLIST_RESPONSE' &&
    (user.role === 'AUDITOR' || user.role === 'OBSERVER') &&
    !auditorCanViewChecklistContent(cycle.status)
  ) {
    throw new AuthError(403, '資料準備階段尚未開放檢視機關檢核表佐證');
  }

  // 中心匯入區(CENTER)僅供委員審閱,受稽機關不可讀取/下載(後端權威阻擋,非僅畫面過濾)
  if (targetType === 'PREP_SUBMISSION' && user.role === 'ORG_ADMIN') {
    const sub = await prisma.prepSubmission.findUnique({
      where: { id: targetId },
      select: { requirement: { select: { category: true } } },
    });
    if (sub?.requirement.category === 'CENTER') {
      throw new AuthError(403, '中心匯入區資料僅供委員審閱，機關無法存取');
    }
  }

  return { user, cycle, cycleId };
}

/**
 * 練習模組存取(批30 師徒制)——單一入口決定「本次請求可觸及哪些觀察員的練習資料」:
 * - OBSERVER:須被配對至此週期(assertCycleAccess 已驗);只及自己 → observerIds=[本人]
 * - AUDITOR:須為此週期「至少一位」觀察員的指導委員;只及自己帶的 → observerIds=配對觀察員
 *   (非其 mentor 的委員一律 403——與「委員意見僅見己見」批62 同隔離哲學)
 * - SUPER_ADMIN:唯讀監督 → observerIds=本週期全部觀察員
 * - ORG_ADMIN:練習資料機關完全不可見(需求二-2)→ 403
 * 寫入權另由呼叫端把關(練習發現=觀察員本人;回饋=mentor)。
 */
export async function assertPracticeAccess(cycleId: string) {
  // 練習結案後仍開放(批49 圖2):放行 CLOSED,使 practice.access 的粗閘與細閘一致
  //(否則練習頁顯示可編輯,新增/評分/送出卻在此 403,且訊息誤稱「尚在開立中」)。
  const { user, cycle } = await assertCycleAccess(cycleId, { allowClosed: true });

  if (user.role === 'ORG_ADMIN') {
    throw new AuthError(403, '練習內容僅供觀察員、指導委員與中心檢視');
  }

  let viewerKind: 'observer' | 'mentor' | 'center';
  let observerIds: string[];
  switch (user.role) {
    case 'OBSERVER':
      viewerKind = 'observer';
      observerIds = [user.id];
      break;
    case 'AUDITOR': {
      const mentees = await prisma.cycleObserver.findMany({
        where: { cycleId: cycle.id, mentorId: user.id },
        select: { observerId: true },
      });
      if (mentees.length === 0) {
        throw new AuthError(403, '您不是本週期任何觀察員的指導委員');
      }
      viewerKind = 'mentor';
      observerIds = mentees.map((m) => m.observerId);
      break;
    }
    case 'SUPER_ADMIN': {
      const all = await prisma.cycleObserver.findMany({
        where: { cycleId: cycle.id },
        select: { observerId: true },
      });
      viewerKind = 'center';
      observerIds = all.map((m) => m.observerId);
      break;
    }
    default:
      throw new AuthError(403, '權限不足');
  }
  return { user, cycle, viewerKind, observerIds };
}

/**
 * 觀察員練習「送出鎖定」後,其練習評分/發現編輯一律擋下(批45;防繞過 UI 直打 API)。
 * 比照委員 assertAuditorScoreUnlocked;鎖定狀態存 CycleObserver.practiceLockedAt。
 */
export async function assertPracticeUnlocked(cycleId: string, observerId: string) {
  const o = await prisma.cycleObserver.findUnique({
    where: { cycleId_observerId: { cycleId, observerId } },
    select: { practiceLockedAt: true },
  });
  if (o?.practiceLockedAt) {
    throw new AuthError(409, '已送出（確認填寫完畢），如需修改請先解除鎖定');
  }
}
