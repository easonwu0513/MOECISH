import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireUser, AuthError } from '@/lib/rbac';
import { saveBuffer } from '@/lib/storage';
import { EVIDENCE_TARGET_TYPES, type EvidenceTargetType } from '@/lib/types';
import { writeAuditLog, extractRequestMeta } from '@/lib/audit-log';

export async function GET(req: Request) {
  try {
    await requireUser();
    const url = new URL(req.url);
    const targetType = url.searchParams.get('targetType') ?? '';
    const targetId = url.searchParams.get('targetId') ?? '';
    if (!EVIDENCE_TARGET_TYPES.includes(targetType as EvidenceTargetType) || !targetId) {
      return NextResponse.json({ error: 'bad params' }, { status: 400 });
    }
    const items = await prisma.evidence.findMany({
      where: { targetType, targetId },
      orderBy: { uploadedAt: 'asc' },
      select: { id: true, originalName: true, storageKey: true, mimeType: true, sizeBytes: true },
    });
    return NextResponse.json({ items });
  } catch (e) {
    if (e instanceof AuthError) return NextResponse.json({ error: e.message }, { status: e.status });
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const user = await requireUser();
    const fd = await req.formData();
    const file = fd.get('file') as File | null;
    const targetType = String(fd.get('targetType') ?? '');
    const targetId = String(fd.get('targetId') ?? '');
    if (!file || !EVIDENCE_TARGET_TYPES.includes(targetType as EvidenceTargetType) || !targetId) {
      return NextResponse.json({ error: 'bad params' }, { status: 400 });
    }

    if (file.size > 5 * 1024 * 1024) {
      return NextResponse.json({ error: '檔案超過 5MB 上限' }, { status: 400 });
    }

    const buf = Buffer.from(await file.arrayBuffer());
    const saved = await saveBuffer(buf, `evidences/${targetType}/${targetId}`, file.name);

    const item = await prisma.evidence.create({
      data: {
        targetType,
        targetId,
        fileName: saved.fileName,
        originalName: file.name,
        mimeType: file.type || 'application/octet-stream',
        sizeBytes: saved.sizeBytes,
        storageKey: saved.storageKey,
        sha256: saved.sha256,
        uploadedById: user.id,
      },
      select: { id: true, originalName: true, storageKey: true, mimeType: true, sizeBytes: true },
    });

    const meta = extractRequestMeta(req);
    await writeAuditLog({
      actorId: user.id,
      action: 'EVIDENCE_UPLOAD',
      entityType: 'Evidence',
      entityId: item.id,
      after: item,
      ...meta,
    });

    return NextResponse.json({ item });
  } catch (e) {
    if (e instanceof AuthError) return NextResponse.json({ error: e.message }, { status: e.status });
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
