import { prisma } from './db';
import type { Role } from './types';

/**
 * 退回收件匣(重塑 R2 / W4):把散落於檢核表 / 資料準備 / 缺失矯正 / 用印掃描檔各頁的「退回待補正」
 * 收斂為單一來源。純查詢既有狀態欄,無 schema 變更。
 *
 * 四類退回的「開啟中(待機關補正)」判定:
 *  ・checklist —— AuditCycle.checklistReopenNote 非空(重新送出時清空,故非空 = 尚未補正)
 *  ・prep      —— PrepSubmission.status = 'INSUFFICIENT'(補正重繳後轉回 SUBMITTED)
 *  ・action    —— CorrectiveAction.status = 'RETURNED'(補正重送後轉回 SUBMITTED)
 *  ・signed    —— 該週期用印掃描檔曾被退回(AuditLog SIGNED_REPORT_RETURN)且目前無任何已繳交版本
 *                (submittedAt 全為 null;重新繳交後即消解)
 */

export type ReturnKind = 'checklist' | 'prep' | 'action' | 'signed-report';

export const RETURN_KIND_LABEL: Record<ReturnKind, string> = {
  checklist: '資通安全檢核表',
  prep: '應備文件',
  action: '缺失矯正措施',
  'signed-report': '用印掃描檔',
};

export type ReturnItem = {
  /** 穩定唯一鍵(React key 用);同機關同週期可有多筆同標題 prep,故不可只靠 kind+cycle+title。 */
  id: string;
  kind: ReturnKind;
  cycleId: string;
  yearROC: number;
  orgName: string;
  /** 標題(如「資通安全檢核表」「應備文件:資產清冊」「矯正措施 第 3 項」)。 */
  title: string;
  /** 退回理由 / 補正說明(可能為 null,如檢核表退回未填原因)。 */
  reason: string | null;
  /** 退回時間;部分類型無精確時戳(如檢核表)則為 null。 */
  returnedAt: Date | null;
  /** 直達補正頁。 */
  href: string;
};

/**
 * 取得目前「退回待補正」清單。
 *  ・ORG_ADMIN → 僅自身機關之週期(單租戶隔離)。
 *  ・SUPER_ADMIN → 全機關(中心監督:哪些退件仍待機關處理)。
 *  ・AUDITOR → 退回非寄給委員,收件匣不適用,回空陣列。
 */
export async function getOpenReturns(opts: {
  role: Role;
  organizationId?: string | null;
}): Promise<ReturnItem[]> {
  // 退回收件匣僅機關(自家)與中心(全機關監督)適用;委員/觀察員(批30)一律空——
  // 原僅擋 AUDITOR,OBSERVER 會落入 orgFilter={} 而讀到全機關退件(含退補原因等跨租戶敏感文字)。
  if (opts.role !== 'ORG_ADMIN' && opts.role !== 'SUPER_ADMIN') return [];
  if (opts.role === 'ORG_ADMIN' && !opts.organizationId) return [];
  const orgFilter =
    opts.role === 'ORG_ADMIN' ? { organizationId: opts.organizationId as string } : {};

  const items: ReturnItem[] = [];

  // 1. 檢核表退回重填
  const reopened = await prisma.auditCycle.findMany({
    where: { ...orgFilter, checklistReopenNote: { not: null }, status: { not: 'CLOSED' } },
    select: {
      id: true,
      year: true,
      updatedAt: true,
      checklistReopenNote: true,
      organization: { select: { name: true } },
    },
  });
  for (const c of reopened) {
    items.push({
      id: `checklist-${c.id}`,
      kind: 'checklist',
      cycleId: c.id,
      yearROC: c.year - 1911,
      orgName: c.organization.name,
      title: RETURN_KIND_LABEL.checklist,
      reason: c.checklistReopenNote,
      returnedAt: null, // 檢核表退回無獨立時戳;不以 updatedAt 佯稱精確退回時間
      href: `/cycles/${c.id}/checklist`,
    });
  }

  // 2. 應備文件(資料準備)退回補正
  const prepSubs = await prisma.prepSubmission.findMany({
    where: {
      status: 'INSUFFICIENT',
      // 僅列「機關此刻仍可補正」者=週期在資料準備中(全掃 P2):階段已過(READY 起)機關無編輯權,
      // 再放進退回收件匣並給「前往補正」CTA=點進去無上傳/改鈕的死路。機關已無法行動的退回別再催。
      requirement: { cycle: { ...orgFilter, status: 'PREPARATION' } },
    },
    select: {
      id: true,
      reviewNote: true,
      reviewedAt: true,
      requirement: {
        select: {
          id: true,
          title: true,
          cycle: { select: { id: true, year: true, organization: { select: { name: true } } } },
        },
      },
    },
  });
  for (const s of prepSubs) {
    const c = s.requirement.cycle;
    items.push({
      id: `prep-${s.id}`,
      kind: 'prep',
      cycleId: c.id,
      yearROC: c.year - 1911,
      orgName: c.organization.name,
      title: `應備文件：${s.requirement.title}`,
      reason: s.reviewNote,
      returnedAt: s.reviewedAt,
      // 直達單項卡(#prep-item;大改造A 顆粒補齊——原只到頁級,承辦得自己找是哪一件)
      href: `/cycles/${c.id}/prep#prep-item-${s.requirement.id}`,
    });
  }

  // 3. 缺失矯正措施退回補正
  const actions = await prisma.correctiveAction.findMany({
    where: {
      status: 'RETURNED',
      deficiency: { cycle: { ...orgFilter, status: { not: 'CLOSED' } } },
    },
    select: {
      reviews: {
        where: { decision: 'RETURN' },
        orderBy: { decidedAt: 'desc' },
        take: 1,
        select: { comment: true, decidedAt: true },
      },
      deficiency: {
        select: {
          id: true,
          itemNo: true,
          cycle: { select: { id: true, year: true, organization: { select: { name: true } } } },
        },
      },
    },
  });
  for (const a of actions) {
    const d = a.deficiency;
    const r = a.reviews[0];
    items.push({
      id: `action-${d.id}`,
      kind: 'action',
      cycleId: d.cycle.id,
      yearROC: d.cycle.year - 1911,
      orgName: d.cycle.organization.name,
      title: `矯正措施 第 ${d.itemNo} 項`,
      reason: r?.comment ?? null,
      returnedAt: r?.decidedAt ?? null,
      href: `/cycles/${d.cycle.id}/deficiencies/${d.id}`,
    });
  }

  // 4. 用印掃描檔退回(以 AuditLog 判定曾退回,交叉核對目前無已繳交版本)
  const reports = await prisma.signedReport.findMany({
    where: { cycle: { ...orgFilter, status: { not: 'CLOSED' } } },
    select: {
      id: true,
      submittedAt: true,
      cycleId: true,
      cycle: { select: { id: true, year: true, organization: { select: { name: true } } } },
    },
  });
  if (reports.length > 0) {
    // 以週期歸戶:任一版本已繳交(submittedAt 非空)= 該週期用印關卡已消解,不列入。
    const byCycle = new Map<string, { anySubmitted: boolean; reportIds: string[]; cycle: (typeof reports)[number]['cycle'] }>();
    for (const r of reports) {
      const g = byCycle.get(r.cycleId) ?? { anySubmitted: false, reportIds: [], cycle: r.cycle };
      if (r.submittedAt) g.anySubmitted = true;
      g.reportIds.push(r.id);
      byCycle.set(r.cycleId, g);
    }
    const openCycles = [...byCycle.entries()].filter(([, g]) => !g.anySubmitted);
    const openReportIds = openCycles.flatMap(([, g]) => g.reportIds);
    const openCycleIds = openCycles.map(([cid]) => cid);
    if (openReportIds.length > 0) {
      // UAT 圖77:退回改為「整組」動作後,軌跡以 AuditCycle/cycleId 定址(掃描檔可被刪,
      // 以 report id 定址的事件會消失);同時相容改版前以 SignedReport/report.id 記錄的歷史軌跡。
      const logs = await prisma.auditLog.findMany({
        where: {
          action: 'SIGNED_REPORT_RETURN',
          OR: [
            { entityType: 'SignedReport', entityId: { in: openReportIds } },
            { entityType: 'AuditCycle', entityId: { in: openCycleIds } },
          ],
        },
        orderBy: { createdAt: 'desc' },
        select: { entityId: true, createdAt: true },
      });
      // 每週期取最近一次退回時間(僅計未繳交週期的報告)
      const latestByCycle = new Map<string, Date>();
      const reportToCycle = new Map(reports.map((r) => [r.id, r.cycleId]));
      for (const l of logs) {
        // entityId 可能是 report id(舊格式)或 cycle id(新格式)
        const cid = reportToCycle.get(l.entityId) ?? (byCycle.has(l.entityId) ? l.entityId : null);
        if (cid && !latestByCycle.has(cid)) latestByCycle.set(cid, l.createdAt);
      }
      for (const [cid, when] of latestByCycle) {
        const g = byCycle.get(cid);
        if (!g || g.anySubmitted) continue;
        items.push({
          id: `signed-${g.cycle.id}`,
          kind: 'signed-report',
          cycleId: g.cycle.id,
          yearROC: g.cycle.year - 1911,
          orgName: g.cycle.organization.name,
          title: RETURN_KIND_LABEL['signed-report'],
          reason: '用印改善報告掃描檔已退回，請重新上傳正確版本後再次「確認繳交」。',
          returnedAt: when,
          href: `/cycles/${g.cycle.id}#signed-report`,
        });
      }
    }
  }

  // 排序:無時戳者(檢核表退回)置頂避免被埋沒(最該補卻無日期),其餘有時戳者新→舊。
  // 兩鍵排序防 null 造成 NaN 比較。
  items.sort((a, b) => {
    const an = a.returnedAt ? 1 : 0; // 0 = 無時戳 → 置頂
    const bn = b.returnedAt ? 1 : 0;
    if (an !== bn) return an - bn;
    return (b.returnedAt?.getTime() ?? 0) - (a.returnedAt?.getTime() ?? 0);
  });
  return items;
}
