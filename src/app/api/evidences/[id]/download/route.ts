import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireUser, AuthError } from '@/lib/rbac';
import { readFileByKey } from '@/lib/storage';

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  try {
    await requireUser();
    const e = await prisma.evidence.findUnique({ where: { id: params.id } });
    if (!e) return NextResponse.json({ error: 'not found' }, { status: 404 });
    const buf = await readFileByKey(e.storageKey);
    return new NextResponse(buf, {
      status: 200,
      headers: {
        'content-type': e.mimeType || 'application/octet-stream',
        'content-disposition': `attachment; filename*=UTF-8''${encodeURIComponent(e.originalName)}`,
      },
    });
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
