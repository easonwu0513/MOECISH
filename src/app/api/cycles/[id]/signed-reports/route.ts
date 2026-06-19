import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { assertCycleAccess } from '@/lib/rbac';
import { errorResponse } from '@/lib/api';
import { saveBuffer } from '@/lib/storage';
import { writeAuditLog, extractRequestMeta } from '@/lib/audit-log';

const ALLOWED = ['application/pdf', 'image/png', 'image/jpeg'];

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  try {
    await assertCycleAccess(params.id);
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
    if (user.role !== 'ORG_ADMIN' && user.role !== 'SUPER_ADMIN') {
      return NextResponse.json({ error: '僅機關管理員可上傳用印掃描檔' }, { status: 403 });
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

/** 最高管理員確認用印掃描檔（結案前置條件） */
export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  try {
    const { user } = await assertCycleAccess(params.id);
    if (user.role !== 'SUPER_ADMIN') {
      return NextResponse.json({ error: '僅最高管理員可確認' }, { status: 403 });
    }
    const url = new URL(req.url);
    const reportId = url.searchParams.get('reportId') ?? '';
    if (!reportId) return NextResponse.json({ error: 'reportId required' }, { status: 400 });

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
