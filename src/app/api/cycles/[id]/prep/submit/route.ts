import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { assertCycleAccess } from '@/lib/rbac';
import { errorResponse } from '@/lib/api';
import { writeAuditLog, extractRequestMeta } from '@/lib/audit-log';
import { notifyPrepSubmitted } from '@/lib/notify';
import { appBaseUrl } from '@/lib/baseUrl';

/**
 * 機關管理員「確定繳交」整批稽核前資料(定稿送交中心)。
 * - 必填項(required)須全部已處理(有檔案 或 已敘明無檔理由),否則擋下並回未完成清單;
 * - 將所有「待繳交(UPLOADED)/已退回(INSUFFICIENT)且已處理」之項目一次轉為 SUBMITTED(鎖定);
 * - 通知中心開始審核。繳交後機關不可再撤回/刪改檔案,需中心退回補正才能再編輯重交。
 */
export async function POST(req: Request, { params }: { params: { id: string } }) {
  try {
    const { user, cycle } = await assertCycleAccess(params.id);
    if (user.role !== 'ORG_ADMIN') {
      return NextResponse.json({ error: '僅機關管理員可繳交資料' }, { status: 403 });
    }
    if (cycle.status !== 'PREPARATION') {
      return NextResponse.json({ error: '此階段無法繳交資料準備' }, { status: 400 });
    }

    const reqs = await prisma.prepRequirement.findMany({
      where: { cycleId: cycle.id },
      include: { submission: true },
      orderBy: { orderIndex: 'asc' },
    });
    if (reqs.length === 0) {
      return NextResponse.json({ error: '尚無資料需求項' }, { status: 400 });
    }

    // 每項是否已處理:已繳交/已確認視為已處理;其餘看有無檔案或無檔理由
    const subIds = reqs.map((r) => r.submission?.id).filter(Boolean) as string[];
    const fileGroups = subIds.length
      ? await prisma.evidence.groupBy({
          by: ['targetId'],
          where: { targetType: 'PREP_SUBMISSION', targetId: { in: subIds } },
          _count: { _all: true },
          _max: { uploadedAt: true },
        })
      : [];
    const fileMap = new Map(fileGroups.map((g) => [g.targetId, g._count._all]));
    const lastUploadMap = new Map(fileGroups.map((g) => [g.targetId, g._max.uploadedAt]));
    const addressed = (r: (typeof reqs)[number]) => {
      const sub = r.submission;
      if (!sub) return false;
      if (sub.status === 'SUBMITTED' || sub.status === 'CONFIRMED') return true;
      const files = fileMap.get(sub.id) ?? 0;
      return files > 0 || !!sub.noFileReason?.trim();
    };

    // 分類繳交:技術檢測 / 實地稽核 截止日不同,可各自獨立繳交;帶 category 則僅繳該類,未帶則整批機關區。
    const body = await req.json().catch(() => ({}));
    const onlyCat = body?.category === 'TECH' || body?.category === 'ONSITE' ? body.category : null;
    // 「中心匯入」區由中心上傳、不走機關繳交流程 → 確定繳交僅涵蓋機關區(技術檢測 / 實地稽核)
    const mechReqs = reqs.filter((r) => r.category !== 'CENTER' && (!onlyCat || r.category === onlyCat));

    // 必填項未處理 → 擋下並回清單
    const missing = mechReqs.filter((r) => r.required && !addressed(r)).map((r) => r.title);
    if (missing.length > 0) {
      return NextResponse.json(
        { error: `尚有必填項目未上傳檔案或敘明無檔理由：${missing.join('、')}` },
        { status: 400 },
      );
    }

    // P0 安全批(退補冪等洞):退回補正(INSUFFICIENT)項須「退補後有新動作」——退補時間之後
    // 有新上傳檔案、或有更新說明/無檔理由——才能重繳;否則原封不動按繳交會清掉中心退補意見、
    // 狀態翻回待審,形成無限循環且中心無從比對。(updatedAt 留 2 秒餘裕,避免與退補同筆寫入誤判)
    const staleReturned = mechReqs
      .filter((r) => {
        const sub = r.submission;
        if (!sub || sub.status !== 'INSUFFICIENT' || !sub.reviewedAt) return false;
        const lastUpload = lastUploadMap.get(sub.id) ?? null;
        const uploadedAfter = lastUpload ? lastUpload.getTime() > sub.reviewedAt.getTime() : false;
        const editedAfter = sub.updatedAt.getTime() > sub.reviewedAt.getTime() + 2000;
        return !uploadedAfter && !editedAfter;
      })
      .map((r) => r.title);
    if (staleReturned.length > 0) {
      return NextResponse.json(
        { error: `下列退回補正項尚未補件或更新說明，請依退補意見處理後再繳交：${staleReturned.join('、')}` },
        { status: 400 },
      );
    }

    // 已處理且尚未繳交/確認者 → 轉 SUBMITTED(含待繳交、已退回、以及舊資料狀態漏更新但有檔者)
    const toSubmit = mechReqs.filter(
      (r) =>
        r.submission &&
        r.submission.status !== 'SUBMITTED' &&
        r.submission.status !== 'CONFIRMED' &&
        addressed(r),
    );
    // 沒有新增可繳交項(都已繳交/確認)→ 視為冪等成功,不以錯誤呈現
    if (toSubmit.length === 0) {
      return NextResponse.json({ ok: true, submitted: 0 });
    }

    await prisma.prepSubmission.updateMany({
      where: { id: { in: toSubmit.map((r) => r.submission!.id) } },
      // 清退回註記(本輪重新繳交);保留 reviewedBy/At 作為「上次審核」痕跡
      data: { status: 'SUBMITTED', submittedAt: new Date(), reviewNote: null },
    });

    const meta = extractRequestMeta(req);
    await writeAuditLog({
      actorId: user.id,
      action: 'PREP_SUBMIT',
      entityType: 'AuditCycle',
      entityId: cycle.id,
      after: { submitted: toSubmit.length },
      ...meta,
    });

    await notifyPrepSubmitted({
      cycleId: cycle.id,
      submittedByName: user.name,
      appBaseUrl: appBaseUrl(req),
    }).catch(() => {});

    return NextResponse.json({ ok: true, submitted: toSubmit.length });
  } catch (e) {
    return errorResponse(e);
  }
}
