import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { assertEvidenceAccess } from '@/lib/rbac';
import { saveBuffer } from '@/lib/storage';
import { applyWatermark, isWatermarkable } from '@/lib/watermark';
import { errorResponse } from '@/lib/api';
import { writeAuditLog, extractRequestMeta } from '@/lib/audit-log';

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
    const fd = await req.formData();
    const file = fd.get('file') as File | null;
    const targetType = String(fd.get('targetType') ?? '');
    const targetId = String(fd.get('targetId') ?? '');
    if (!file) {
      return NextResponse.json({ error: '缺少檔案' }, { status: 400 });
    }
    // 驗證存取權 + targetId 為合法 cuid(同時阻擋路徑穿越)
    const { user, cycle } = await assertEvidenceAccess(targetType, targetId);

    if (file.size > 20 * 1024 * 1024) {
      return NextResponse.json({ error: '檔案超過 20MB 上限' }, { status: 400 });
    }

    let buf: Buffer = Buffer.from(await file.arrayBuffer());
    const mime = file.type || 'application/octet-stream';

    // 單位管理員上傳的 PDF/圖片自動加機關浮水印(防外流、可溯源);其餘類型/角色維持原檔
    let watermarked = false;
    if (user.role === 'ORG_ADMIN' && isWatermarkable(mime)) {
      const org = await prisma.organization.findUnique({
        where: { id: cycle.organizationId },
        select: { name: true, shortName: true },
      });
      const orgName = org?.name || org?.shortName || '受稽機關';
      const dateStr = new Date().toLocaleDateString('zh-TW');
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
    await writeAuditLog({
      actorId: user.id,
      action: 'EVIDENCE_UPLOAD',
      entityType: 'Evidence',
      entityId: item.id,
      after: { ...item, watermarked },
      ...meta,
    });

    return NextResponse.json({ item });
  } catch (e) {
    return errorResponse(e);
  }
}
