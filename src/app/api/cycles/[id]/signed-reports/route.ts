import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { assertCycleAccess } from '@/lib/rbac';
import { errorResponse } from '@/lib/api';
import { saveBuffer } from '@/lib/storage';
import { writeAuditLog, extractRequestMeta } from '@/lib/audit-log';
import { notifyCycleSignedReportSubmitted, orgAdminWhere } from '@/lib/notify';
import { appBaseUrl } from '@/lib/baseUrl';

const ALLOWED = ['application/pdf', 'image/png', 'image/jpeg'];

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
      return NextResponse.json({ error: '週期已結案,不可再上傳用印掃描檔' }, { status: 409 });
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
        { error: '用印掃描檔已確認繳交,不可再上傳;如需更換請聯繫中心退回' },
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

    const buf = Buffer.from(await file.arrayBuffer());
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
      entityType: 'SignedReport',
      entityId: item.id,
      after: { fileName: item.fileName, sha256: item.sha256 },
      ...meta,
    });

    return NextResponse.json({ item });
  } catch (e) {
    return errorResponse(e);
  }
}

/**
 * action=submit → 機關管理員「確認繳交」:鎖定此掃描檔為正式繳交版本 + 通知中心(email + 站內)
 * action=return → 最高管理員退回:解除鎖定,讓機關可重新上傳/繳交(站內通知機關)
 * action=confirm(預設)→ 最高管理員確認(結案前置條件),須機關已確認繳交
 */
export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  try {
    const { user, cycle } = await assertCycleAccess(params.id);
    const url = new URL(req.url);
    const reportId = url.searchParams.get('reportId') ?? '';
    const action = url.searchParams.get('action') ?? 'confirm';
    if (!reportId) return NextResponse.json({ error: '請求參數不完整,請重新整理後再試' }, { status: 400 });

    // 只操作本週期下的掃描檔,避免跨週期竄改
    const report = await prisma.signedReport.findUnique({ where: { id: reportId } });
    if (!report || report.cycleId !== cycle.id) {
      return NextResponse.json({ error: '找不到用印掃描檔' }, { status: 404 });
    }

    if (action === 'submit') {
      if (user.role !== 'ORG_ADMIN') {
        return NextResponse.json({ error: '僅機關管理員可確認繳交' }, { status: 403 });
      }
      if (cycle.status === 'CLOSED') {
        return NextResponse.json({ error: '週期已結案,不可再繳交' }, { status: 409 });
      }
      if (cycle.status !== 'REMEDIATION') {
        return NextResponse.json({ error: '用印掃描檔於「矯正執行」階段方可上傳' }, { status: 400 });
      }
      if (report.submittedAt) {
        return NextResponse.json({ error: '此掃描檔已確認繳交,不需重複繳交' }, { status: 409 });
      }
      // 一份週期只留一個正式繳交版本。用可序列化交易讓「檢查其他鎖定版本 + 標記繳交」原子化,
      // 避免兩份草稿同時繳交造成雙鎖定版本(count-then-update race)。
      let outcome;
      try {
        outcome = await prisma.$transaction(
          async (tx) => {
            const otherLocked = await tx.signedReport.count({
              where: {
                cycleId: cycle.id,
                id: { not: reportId },
                OR: [{ submittedAt: { not: null } }, { confirmedAt: { not: null } }],
              },
            });
            if (otherLocked > 0) return { conflict: true as const, item: null };
            const updated = await tx.signedReport.update({
              where: { id: reportId },
              data: { submittedById: user.id, submittedAt: new Date() },
            });
            return { conflict: false as const, item: updated };
          },
          { isolationLevel: 'Serializable' },
        );
      } catch (e) {
        // 兩筆繳交同時競爭時其中一筆會序列化失敗(P2034)→ 轉為 409 請重試
        if ((e as { code?: string }).code === 'P2034') {
          return NextResponse.json({ error: '系統忙碌,請稍後再試' }, { status: 409 });
        }
        throw e;
      }
      if (outcome.conflict) {
        return NextResponse.json(
          { error: '已有繳交版本,不可重複繳交;如需更換請聯繫中心退回' },
          { status: 409 },
        );
      }
      const item = outcome.item;

      const meta = extractRequestMeta(req);
      await writeAuditLog({
        actorId: user.id,
        action: 'SIGNED_REPORT_SUBMIT',
        entityType: 'SignedReport',
        entityId: item.id,
        after: { fileName: item.fileName },
        ...meta,
      });

      // 通知中心「已繳交用印掃描檔」(失敗不擋流程)
      await notifyCycleSignedReportSubmitted({
        cycleId: cycle.id,
        submittedByName: user.name,
        fileName: item.fileName,
        appBaseUrl: appBaseUrl(req),
      }).catch((e) => console.error('[signed-report] notify failed:', (e as Error).message));

      return NextResponse.json({ item });
    }

    if (action === 'return') {
      // 中心退回:解除鎖定,讓機關可重新上傳/繳交正確版本(這是各處提示「聯繫中心退回」的實際入口)
      if (user.role !== 'SUPER_ADMIN') {
        return NextResponse.json({ error: '僅最高管理員可退回用印掃描檔' }, { status: 403 });
      }
      if (cycle.status === 'CLOSED') {
        return NextResponse.json({ error: '週期已結案,不可退回' }, { status: 409 });
      }
      if (!report.submittedAt && !report.confirmedAt) {
        return NextResponse.json({ error: '此掃描檔尚未繳交,無須退回' }, { status: 409 });
      }
      const item = await prisma.signedReport.update({
        where: { id: reportId },
        data: { submittedById: null, submittedAt: null, confirmedById: null, confirmedAt: null },
      });

      const meta = extractRequestMeta(req);
      await writeAuditLog({
        actorId: user.id,
        action: 'SIGNED_REPORT_RETURN',
        entityType: 'SignedReport',
        entityId: item.id,
        after: { fileName: item.fileName },
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
              body: '您上傳的用印改善報告掃描檔已被中心退回,請重新上傳正確版本後再次按「確認繳交」。',
              link: `/cycles/${cycle.id}#signed-report`,
            })),
          });
        }
      } catch (e) {
        console.error('[signed-report] return notify failed:', (e as Error).message);
      }

      return NextResponse.json({ item });
    }

    // action === 'confirm':最高管理員確認(結案前置),須機關已確認繳交
    if (user.role !== 'SUPER_ADMIN') {
      return NextResponse.json({ error: '僅最高管理員可確認' }, { status: 403 });
    }
    if (cycle.status !== 'REMEDIATION' && cycle.status !== 'CLOSED') {
      return NextResponse.json({ error: '尚未進入矯正執行階段,無法確認' }, { status: 400 });
    }
    if (!report.submittedAt) {
      return NextResponse.json({ error: '機關尚未確認繳交,無法確認' }, { status: 409 });
    }

    const item = await prisma.signedReport.update({
      where: { id: reportId },
      data: { confirmedById: user.id, confirmedAt: new Date() },
    });

    const meta = extractRequestMeta(req);
    await writeAuditLog({
      actorId: user.id,
      action: 'SIGNED_REPORT_CONFIRM',
      entityType: 'SignedReport',
      entityId: item.id,
      ...meta,
    });

    return NextResponse.json({ item });
  } catch (e) {
    return errorResponse(e);
  }
}
