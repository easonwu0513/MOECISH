import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { assertCycleAccess, AuthError } from '@/lib/rbac';
import { saveBuffer } from '@/lib/storage';
import { SIGNATURE_ROLES, type SignatureRole } from '@/lib/types';
import { writeAuditLog, extractRequestMeta } from '@/lib/audit-log';

export async function POST(req: Request, { params }: { params: { id: string } }) {
  try {
    const { user, cycle } = await assertCycleAccess(params.id);
    const fd = await req.formData();
    const file = fd.get('file') as File | null;
    const signerRole = String(fd.get('signerRole') ?? '');
    if (!file || !SIGNATURE_ROLES.includes(signerRole as SignatureRole)) {
      return NextResponse.json({ error: 'bad params' }, { status: 400 });
    }

    // role check: 對應角色才能簽
    if (signerRole === 'RESPONDENT' && user.role !== 'RESPONDENT') {
      return NextResponse.json({ error: '僅填報人可上傳填報人簽章' }, { status: 403 });
    }
    if (signerRole === 'SUPERVISOR' && user.role !== 'SUPERVISOR') {
      return NextResponse.json({ error: '僅單位主管可上傳主管簽章' }, { status: 403 });
    }

    if (file.size > 10 * 1024 * 1024) {
      return NextResponse.json({ error: '檔案須小於 10MB' }, { status: 400 });
    }
    const ALLOWED = ['image/png', 'image/jpeg', 'application/pdf'];
    if (!ALLOWED.includes(file.type)) {
      return NextResponse.json({ error: '僅接受 PDF / PNG / JPG' }, { status: 400 });
    }

    const buf = Buffer.from(await file.arrayBuffer());
    const saved = await saveBuffer(buf, `signatures/${cycle.id}`, file.name);

    const meta = extractRequestMeta(req);

    const sig = await prisma.signature.create({
      data: {
        cycleId: cycle.id,
        signerRole,
        signerId: user.id,
        signerName: user.name,
        imageKey: saved.storageKey,
        imageSha256: saved.sha256,
        ipAddress: meta.ipAddress,
      },
    });

    await writeAuditLog({
      actorId: user.id,
      action: 'SIGNATURE_UPLOAD',
      entityType: 'Signature',
      entityId: sig.id,
      after: { signerRole, cycleId: cycle.id, sha256: saved.sha256 },
      ...meta,
    });

    return NextResponse.json({ id: sig.id, signerRole, signedAt: sig.signedAt });
  } catch (e) {
    if (e instanceof AuthError) return NextResponse.json({ error: e.message }, { status: e.status });
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
