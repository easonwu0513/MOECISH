import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { assertCycleAccess } from '@/lib/rbac';
import { errorResponse } from '@/lib/api';
import { saveBuffer, deleteFileByKey } from '@/lib/storage';
import { writeAuditLog, extractRequestMeta } from '@/lib/audit-log';
import { notifyCycleSignedReportSubmitted, orgAdminWhere } from '@/lib/notify';
import { appBaseUrl } from '@/lib/baseUrl';
import { applyWatermark } from '@/lib/watermark';
import { fmtROC } from '@/lib/date';

const ALLOWED = ['application/pdf', 'image/png', 'image/jpeg'];

/** P0 安全批:以檔案 magic bytes 判定真實型別(不信任副檔名/Content-Type)——與 evidences POST 同手法。 */
function sniffWatermarkableType(buf: Buffer): 'application/pdf' | 'image/png' | 'image/jpeg' | null {
  if (buf.length >= 5 && buf[0] === 0x25 && buf[1] === 0x50 && buf[2] === 0x44 && buf[3] === 0x46) return 'application/pdf'; // %PDF
  if (buf.length >= 8 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return 'image/png'; // PNG
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg'; // JPEG
  return null;
}

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  try {
    const { user } = await assertCycleAccess(params.id);
    // 用印掃描檔僅中心/機關經手(access-policy 'signedReport.section' 排除委員);觀察員(批30)亦不可見。
    // assertCycleAccess 通過的委員/配對觀察員在此再擋一道(避免直打 API 取得用印檔清單=metadata 洩漏)。
    if (user.role !== 'SUPER_ADMIN' && user.role !== 'ORG_ADMIN') {
      return NextResponse.json({ error: '用印掃描檔僅機關與中心可檢視' }, { status: 403 });
    }
    const items = await prisma.signedReport.findMany({
      where: { cycleId: params.id },
      orderBy: { uploadedAt: 'desc' },
    });
    return NextResponse.json({ items });
  } catch (e) {
    return errorResponse(e);
  }
}

/** 機關管理員上傳用印掃描檔（PDF / 圖片） */
export async function POST(req: Request, { params }: { params: { id: string } }) {
  try {
    const { user, cycle } = await assertCycleAccess(params.id);
    if (user.role !== 'ORG_ADMIN') {
      return NextResponse.json({ error: '僅機關管理員可上傳用印掃描檔' }, { status: 403 });
    }
    if (cycle.status === 'CLOSED') {
      return NextResponse.json({ error: '週期已結案，不可再上傳用印掃描檔' }, { status: 409 });
    }
    // 用印掃描檔為「矯正執行」收尾產物:須到達 REMEDIATION 階段方可上傳(對齊 access-policy signedReport.upload)
    if (cycle.status !== 'REMEDIATION') {
      return NextResponse.json({ error: '用印掃描檔於「矯正執行」階段方可上傳' }, { status: 400 });
    }
    // 一旦機關「確認繳交」(submittedAt)或中心已確認(confirmedAt),檔案即鎖定,不可再上傳新版
    const lockedCount = await prisma.signedReport.count({
      where: {
        cycleId: cycle.id,
        OR: [{ submittedAt: { not: null } }, { confirmedAt: { not: null } }],
      },
    });
    if (lockedCount > 0) {
      return NextResponse.json(
        { error: '用印掃描檔已確認繳交，不可再上傳；如需更換請聯繫中心退回' },
        { status: 409 },
      );
    }
    const fd = await req.formData();
    const file = fd.get('file') as File | null;
    if (!file) return NextResponse.json({ error: '請選擇檔案' }, { status: 400 });
    if (!ALLOWED.includes(file.type)) {
      return NextResponse.json({ error: '僅接受 PDF 或圖片（PNG/JPG）' }, { status: 400 });
    }
    if (file.size > 20 * 1024 * 1024) {
      return NextResponse.json({ error: '檔案超過 20MB 上限' }, { status: 400 });
    }

    // P0 安全批:①magic bytes 驗真實型別(擋改副檔名的 Word/Excel)②燒浮水印(機關密件,外流可溯源)
    let buf: Buffer = Buffer.from(await file.arrayBuffer());
    const realMime = sniffWatermarkableType(buf);
    if (!realMime) {
      return NextResponse.json(
        { error: '檔案內容不是有效的 PDF / PNG / JPG（可能是改了副檔名的其他檔案）；請以掃描或另存 PDF 後上傳。' },
        { status: 400 },
      );
    }
    const org = await prisma.organization.findUnique({ where: { id: cycle.organizationId }, select: { name: true } });
    buf = await applyWatermark(buf, realMime, {
      tile: `${cycle.year - 1911}年度用印報告・請勿外流`,
      footer: `${org?.name ?? ''}・${cycle.year - 1911}年度・${fmtROC(new Date())} 上傳`,
    });
    const saved = await saveBuffer(buf, `signed-reports/${cycle.id}`, file.name);

    const item = await prisma.signedReport.create({
      data: {
        cycleId: cycle.id,
        fileKey: saved.storageKey,
        fileName: file.name,
        sha256: saved.sha256,
        uploadedById: user.id,
      },
    });

    const meta = extractRequestMeta(req);
    await writeAuditLog({
      actorId: user.id,
      action: 'SIGNED_REPORT_UPLOAD',
      // 以 AuditCycle/cycleId 定址(比照批67 佐證):掃描檔日後被刪,上傳事件仍留在活動流
      entityType: 'AuditCycle',
      entityId: cycle.id,
      after: { fileName: item.fileName, sha256: item.sha256 },
      ...meta,
    });

    return NextResponse.json({ item });
  } catch (e) {
    return errorResponse(e);
  }
}

/**
 * 用印掃描檔的繳交/退回/確認——UAT 圖77 起改為「整組」語意:
 * 一份用印改善報告可能分成多個掃描檔(頁數多、或受單檔 20MB 上限所限),故三個動作皆以
 * 「本週期全部掃描檔」為單位。原本以單一 reportId 操作,繳交其中一份就把其餘永遠鎖在
 * 「未繳交」且無法補繳(可上傳多份卻只能繳一份=語意矛盾)。
 *   action=submit → 機關管理員「確認繳交」:把尚未繳交的掃描檔整組鎖定 + 通知中心
 *   action=return → 最高管理員退回:整組解除鎖定,機關可增刪重傳後再繳交
 *   action=confirm(預設)→ 最高管理員確認(結案前置),把已繳交者整組標記確認
 * reportId 參數已不需要(仍相容舊請求,忽略之);單檔刪除改走 DELETE。
 */
export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  try {
    const { user, cycle } = await assertCycleAccess(params.id);
    const url = new URL(req.url);
    const action = url.searchParams.get('action') ?? 'confirm';
    // 用印掃描檔僅中心/機關經手:角色閘前置,避免委員/觀察員由「查無/無權」錯誤差異探知檔案是否存在(同 GET :27)
    if (user.role !== 'SUPER_ADMIN' && user.role !== 'ORG_ADMIN') {
      return NextResponse.json({ error: '用印掃描檔僅機關與中心可操作' }, { status: 403 });
    }

    const reports = await prisma.signedReport.findMany({
      where: { cycleId: cycle.id },
      orderBy: { uploadedAt: 'asc' },
    });
    if (reports.length === 0) {
      return NextResponse.json({ error: '本週期尚未上傳用印掃描檔' }, { status: 404 });
    }
    // 通知/軌跡用的整組摘要(首檔名 + 份數)
    const summary = (list: typeof reports) =>
      `${list[0]?.fileName ?? ''}${list.length > 1 ? ` 等 ${list.length} 份` : ''}`;

    if (action === 'submit') {
      if (user.role !== 'ORG_ADMIN') {
        return NextResponse.json({ error: '僅機關管理員可確認繳交' }, { status: 403 });
      }
      if (cycle.status === 'CLOSED') {
        return NextResponse.json({ error: '週期已結案，不可再繳交' }, { status: 409 });
      }
      if (cycle.status !== 'REMEDIATION') {
        return NextResponse.json({ error: '用印掃描檔於「矯正執行」階段方可上傳' }, { status: 400 });
      }
      if (reports.some((r) => r.confirmedAt)) {
        return NextResponse.json(
          { error: '已有經中心確認的版本，不可再繳交；如需更換請聯繫中心退回' },
          { status: 409 },
        );
      }
      const pending = reports.filter((r) => !r.submittedAt);
      if (pending.length === 0) {
        return NextResponse.json({ error: '掃描檔已全部確認繳交，不需重複繳交' }, { status: 409 });
      }
      // 單一 updateMany 即原子操作(where 帶 submittedAt: null),不需可序列化交易:
      // 併發重複按只有一次會命中未繳交列,另一次影響 0 列。
      const { count } = await prisma.signedReport.updateMany({
        where: { cycleId: cycle.id, submittedAt: null },
        data: { submittedById: user.id, submittedAt: new Date() },
      });
      // 併發重按:後到者命中 0 列 → 不重複寫軌跡、不重複寄信(以實際影響列數為準,非前面的讀取快照)
      if (count === 0) {
        return NextResponse.json({ error: '掃描檔已全部確認繳交，不需重複繳交' }, { status: 409 });
      }

      const meta = extractRequestMeta(req);
      await writeAuditLog({
        actorId: user.id,
        action: 'SIGNED_REPORT_SUBMIT',
        // 以 AuditCycle/cycleId 定址(比照批67 佐證作法):整組動作無單一檔案主體,
        // 且掃描檔日後被刪不致讓活動流事件消失。
        entityType: 'AuditCycle',
        entityId: cycle.id,
        after: { fileNames: pending.map((r) => r.fileName), count: pending.length },
        ...meta,
      });

      // 通知中心「已繳交用印掃描檔」(失敗不擋流程)
      await notifyCycleSignedReportSubmitted({
        cycleId: cycle.id,
        submittedByName: user.name,
        fileName: summary(pending),
        appBaseUrl: appBaseUrl(req),
      }).catch((e) => console.error('[signed-report] notify failed:', (e as Error).message));

      return NextResponse.json({ submitted: pending.length });
    }

    if (action === 'return') {
      // 中心退回:整組解除鎖定,讓機關重新整理版本(這是各處提示「聯繫中心退回」的實際入口)
      if (user.role !== 'SUPER_ADMIN') {
        return NextResponse.json({ error: '僅最高管理員可退回用印掃描檔' }, { status: 403 });
      }
      if (cycle.status === 'CLOSED') {
        return NextResponse.json({ error: '週期已結案，不可退回' }, { status: 409 });
      }
      const locked = reports.filter((r) => r.submittedAt || r.confirmedAt);
      if (locked.length === 0) {
        return NextResponse.json({ error: '掃描檔尚未繳交，無須退回' }, { status: 409 });
      }
      const { count } = await prisma.signedReport.updateMany({
        where: { cycleId: cycle.id, OR: [{ submittedAt: { not: null } }, { confirmedAt: { not: null } }] },
        data: { submittedById: null, submittedAt: null, confirmedById: null, confirmedAt: null },
      });
      if (count === 0) {
        return NextResponse.json({ error: '掃描檔尚未繳交，無須退回' }, { status: 409 });
      }

      const meta = extractRequestMeta(req);
      await writeAuditLog({
        actorId: user.id,
        action: 'SIGNED_REPORT_RETURN',
        entityType: 'AuditCycle',
        entityId: cycle.id,
        after: { fileNames: locked.map((r) => r.fileName), count: locked.length },
        ...meta,
      });

      // 退回不寄信(比照實地稽核退件慣例),僅建立站內通知供機關重新上傳
      try {
        const orgAdmins = await prisma.user.findMany({
          where: orgAdminWhere(cycle.organizationId),
          select: { id: true },
        });
        if (orgAdmins.length > 0) {
          await prisma.notification.createMany({
            data: orgAdmins.map((u) => ({
              userId: u.id,
              kind: 'signed-report-returned',
              title: '用印掃描檔已退回',
              body: '您上傳的用印改善報告掃描檔已被中心退回，請重新上傳正確版本後再次按「確認繳交」。',
              link: `/cycles/${cycle.id}#signed-report`,
            })),
          });
        }
      } catch (e) {
        console.error('[signed-report] return notify failed:', (e as Error).message);
      }

      return NextResponse.json({ returned: locked.length });
    }

    // action === 'confirm':最高管理員確認(結案前置),須機關已確認繳交;整組一次確認
    if (user.role !== 'SUPER_ADMIN') {
      return NextResponse.json({ error: '僅最高管理員可確認' }, { status: 403 });
    }
    if (cycle.status !== 'REMEDIATION' && cycle.status !== 'CLOSED') {
      return NextResponse.json({ error: '尚未進入矯正執行階段，無法確認' }, { status: 400 });
    }
    if (!reports.some((r) => r.submittedAt)) {
      return NextResponse.json({ error: '機關尚未確認繳交，無法確認' }, { status: 409 });
    }
    const toConfirm = reports.filter((r) => r.submittedAt && !r.confirmedAt);
    if (toConfirm.length === 0) {
      return NextResponse.json({ error: '掃描檔已全部確認' }, { status: 409 });
    }

    const { count } = await prisma.signedReport.updateMany({
      where: { cycleId: cycle.id, submittedAt: { not: null }, confirmedAt: null },
      data: { confirmedById: user.id, confirmedAt: new Date() },
    });
    if (count === 0) {
      return NextResponse.json({ error: '掃描檔已全部確認' }, { status: 409 });
    }

    const meta = extractRequestMeta(req);
    await writeAuditLog({
      actorId: user.id,
      action: 'SIGNED_REPORT_CONFIRM',
      entityType: 'AuditCycle',
      entityId: cycle.id,
      after: { fileNames: toConfirm.map((r) => r.fileName), count: toConfirm.length },
      ...meta,
    });

    return NextResponse.json({ confirmed: toConfirm.length });
  } catch (e) {
    return errorResponse(e);
  }
}

/**
 * 刪除尚未繳交的用印掃描檔(僅機關管理員;UAT 圖77)。
 * 整組繳交語意下,誤傳的檔案必須能移除,否則會被連帶繳交進正式版本。
 * 已繳交/已確認者不可刪(須先由中心退回),週期結案後亦不可刪。
 */
export async function DELETE(req: Request, { params }: { params: { id: string } }) {
  try {
    const { user, cycle } = await assertCycleAccess(params.id);
    if (user.role !== 'ORG_ADMIN') {
      return NextResponse.json({ error: '僅機關管理員可刪除用印掃描檔' }, { status: 403 });
    }
    const reportId = new URL(req.url).searchParams.get('reportId') ?? '';
    if (!reportId) return NextResponse.json({ error: '請求參數不完整，請重新整理後再試' }, { status: 400 });

    const report = await prisma.signedReport.findUnique({ where: { id: reportId } });
    if (!report || report.cycleId !== cycle.id) {
      return NextResponse.json({ error: '找不到用印掃描檔' }, { status: 404 });
    }
    if (cycle.status === 'CLOSED') {
      return NextResponse.json({ error: '週期已結案，不可刪除' }, { status: 409 });
    }
    if (report.submittedAt || report.confirmedAt) {
      return NextResponse.json(
        { error: '此掃描檔已確認繳交，不可刪除；如需更換請聯繫中心退回' },
        { status: 409 },
      );
    }

    // 條件式刪除(對抗審查):read-then-delete 之間該檔可能剛被繳交/確認,謂詞隨 deleteMany 重帶
    const { count } = await prisma.signedReport.deleteMany({
      where: { id: reportId, cycleId: cycle.id, submittedAt: null, confirmedAt: null },
    });
    if (count === 0) {
      return NextResponse.json(
        { error: '此掃描檔已確認繳交，不可刪除；如需更換請聯繫中心退回' },
        { status: 409 },
      );
    }
    // 實體檔清除失敗不擋(DB 已無參照),但要留下運維可見的軌跡
    await deleteFileByKey(report.fileKey).catch((e) =>
      console.error('[signed-report] file delete failed:', report.fileKey, (e as Error).message),
    );

    await writeAuditLog({
      actorId: user.id,
      action: 'SIGNED_REPORT_DELETE',
      entityType: 'AuditCycle',
      entityId: cycle.id,
      after: { fileName: report.fileName },
      ...extractRequestMeta(req),
    });

    return NextResponse.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
