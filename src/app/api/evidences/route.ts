import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { assertEvidenceAccess, requireUser } from '@/lib/rbac';
import { saveBuffer } from '@/lib/storage';
import { applyWatermark, isWatermarkable } from '@/lib/watermark';
import { prepOrgCanEdit, checklistOrgCanEdit, isOrgUploadAllowed } from '@/lib/types';
import { errorResponse } from '@/lib/api';
import { writeAuditLog, extractRequestMeta } from '@/lib/audit-log';
import { rocDateDotted } from '@/lib/date';

/**
 * 以檔案開頭 magic bytes 判定真實型別(僅認可加浮水印的三種),不信任副檔名 / Content-Type。
 * 杜絕「.docx 改名 .pdf + 偽造 Content-Type」繞過浮水印的情形。
 */
function sniffWatermarkableType(buf: Buffer): 'application/pdf' | 'image/png' | 'image/jpeg' | null {
  if (buf.length >= 5 && buf[0] === 0x25 && buf[1] === 0x50 && buf[2] === 0x44 && buf[3] === 0x46) return 'application/pdf'; // %PDF
  if (buf.length >= 8 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return 'image/png'; // PNG
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg'; // JPEG
  return null;
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const targetType = url.searchParams.get('targetType') ?? '';
    const targetId = url.searchParams.get('targetId') ?? '';
    // 驗證呼叫者對該佐證對象有存取權(杜絕跨機關枚舉);格式/不存在/越權皆於此擋下
    await assertEvidenceAccess(targetType, targetId);
    const items = await prisma.evidence.findMany({
      where: { targetType, targetId },
      orderBy: { uploadedAt: 'asc' },
      // 不回傳 storageKey(內部儲存路徑不外洩)
      select: { id: true, originalName: true, mimeType: true, sizeBytes: true },
    });
    return NextResponse.json({ items });
  } catch (e) {
    return errorResponse(e);
  }
}

export async function POST(req: Request) {
  try {
    // 上傳=寫入官方紀錄:僅機關(自家佐證)與中心(匯入區)可上傳。委員/觀察員(批30)為唯讀,
    // 於解析檔案前即擋下(assertEvidenceAccess 是「讀取」授權,已放行委員/觀察員的線上檢視;寫入須另擋
    // ——否則觀察員可對機關檢核表/資料準備附加佐證,污染官方紀錄;批30 對抗審查 P2)。
    const actor = await requireUser();
    if (actor.role === 'AUDITOR' || actor.role === 'OBSERVER') {
      return NextResponse.json({ error: '委員與觀察員為唯讀，不可上傳佐證' }, { status: 403 });
    }

    const fd = await req.formData();
    const file = fd.get('file') as File | null;
    const targetType = String(fd.get('targetType') ?? '');
    const targetId = String(fd.get('targetId') ?? '');
    if (!file) {
      return NextResponse.json({ error: '缺少檔案' }, { status: 400 });
    }
    // 驗證存取權 + targetId 為合法 cuid(同時阻擋路徑穿越)
    const { user, cycle } = await assertEvidenceAccess(targetType, targetId);

    // 檢核表佐證:機關僅「資料準備中」可上傳(開立中尚未開放;送出鎖定後 checklistSubmittedAt 另擋)
    if (targetType === 'CHECKLIST_RESPONSE' && user.role === 'ORG_ADMIN' && !checklistOrgCanEdit(cycle.status)) {
      return NextResponse.json({ error: '需於「資料準備中」階段才能上傳檢核表佐證（開立中尚未開放）' }, { status: 400 });
    }

    // 準備文件:資料準備階段結束後凍結;機關已繳交/中心已確認後鎖定,不可再上傳(需中心退回);中心覆寫不受限
    if (targetType === 'PREP_SUBMISSION' && user.role === 'ORG_ADMIN') {
      if (!prepOrgCanEdit(cycle.status)) {
        return NextResponse.json({ error: '需於「資料準備中」階段才能上傳（開立中尚未開放、資料準備結束後凍結）' }, { status: 400 });
      }
      const sub = await prisma.prepSubmission.findUnique({
        where: { id: targetId },
        select: { status: true, requirement: { select: { category: true } } },
      });
      // 中心匯入區由中心上傳,機關不可上傳
      if (sub?.requirement?.category === 'CENTER') {
        return NextResponse.json({ error: '中心匯入區由中心上傳，機關無法上傳此區資料' }, { status: 403 });
      }
      if (sub && (sub.status === 'SUBMITTED' || sub.status === 'CONFIRMED')) {
        return NextResponse.json({ error: '資料已繳交或已確認齊備，如需修改請洽中心退回' }, { status: 400 });
      }
    }

    if (file.size > 20 * 1024 * 1024) {
      return NextResponse.json({ error: '檔案超過 20MB 上限' }, { status: 400 });
    }

    let buf: Buffer = Buffer.from(await file.arrayBuffer());
    let mime = file.type || 'application/octet-stream';

    // 須加浮水印的上傳(機關佐證 + 中心匯入的稽核前資料,委員都會審閱)一律僅允許可加浮水印格式
    // (PDF/JPG/PNG);Word、Excel 等須先另存為 PDF 再上傳。中心匯入(PREP_SUBMISSION)亦受此限。
    const mustWatermark = user.role === 'ORG_ADMIN' || targetType === 'PREP_SUBMISSION';
    if (mustWatermark) {
      // 友善前檢:副檔名與 Content-Type 皆明顯不符 → 直接擋,訊息清楚。
      if (!isOrgUploadAllowed(file.name, mime)) {
        return NextResponse.json(
          { error: '僅接受 PDF / JPG / PNG 檔（供委員審閱時加浮水印）；Word、Excel、簡報等可編輯檔請先另存為 PDF 再上傳。' },
          { status: 400 },
        );
      }
      // 權威檢查:以實際內容判定真實型別(不信任副檔名/Content-Type),確保檔案一定可加浮水印,
      // 並以真實型別作為浮水印與 DB mimeType 依據。
      const realMime = sniffWatermarkableType(buf);
      if (!realMime) {
        return NextResponse.json(
          { error: '檔案內容不是有效的 PDF / JPG / PNG（可能是改了副檔名的 Word/Excel 等）；請以原程式「另存為 PDF」後再上傳。' },
          { status: 400 },
        );
      }
      mime = realMime;
    }

    // 須加浮水印對象的 PDF/圖片自動加浮水印(機關佐證 + 中心匯入;防外流、可溯源);其餘維持原檔
    let watermarked = false;
    if (mustWatermark && isWatermarkable(mime)) {
      const org = await prisma.organization.findUnique({
        where: { id: cycle.organizationId },
        select: { name: true, shortName: true },
      });
      const orgName = org?.name || org?.shortName || '受稽機關';
      // 民國點分隔(全掃 P2):原 toLocaleDateString 產西曆「2026/6/11」與同註記 ${yr}年度(民國)矛盾,
      // 且無時區→UTC 主機近午夜偏日;rocDateDotted 走台北時區,產「115.06.11」。此為蓋在佐證檔上的永久註記。
      const dateStr = rocDateDotted(new Date());
      const yr = cycle.year - 1911;
      const out = await applyWatermark(buf, mime, {
        tile: `${yr}年度資安稽核佐證・請勿外流`,
        footer: `${orgName}・${yr}年度資安稽核佐證・上傳 ${dateStr}`,
      });
      watermarked = out !== buf;
      buf = out;
    }

    const saved = await saveBuffer(buf, `evidences/${targetType}/${targetId}`, file.name);

    const item = await prisma.evidence.create({
      data: {
        targetType,
        targetId,
        fileName: saved.fileName,
        originalName: file.name,
        mimeType: mime,
        sizeBytes: saved.sizeBytes,
        storageKey: saved.storageKey,
        sha256: saved.sha256,
        uploadedById: user.id,
      },
      select: { id: true, originalName: true, mimeType: true, sizeBytes: true },
    });

    const meta = extractRequestMeta(req);
    // 以 AuditCycle/cycleId 定址(批67 專審):活動流以「本週期」撈事件——若以 Evidence id 定址,
    // 佐證被硬刪後 id 查不回本週期,上傳/刪除事件會從活動流永久消失;佐證明細保留於 after payload。
    await writeAuditLog({
      actorId: user.id,
      action: 'EVIDENCE_UPLOAD',
      entityType: 'AuditCycle',
      entityId: cycle.id,
      after: { evidenceId: item.id, ...item, watermarked, targetType, targetId },
      ...meta,
    });

    return NextResponse.json({ item });
  } catch (e) {
    return errorResponse(e);
  }
}
