import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireUser, AuthError } from '@/lib/rbac';
import { readFileByKey } from '@/lib/storage';

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  try {
    await requireUser();
    const sig = await prisma.signature.findUnique({ where: { id: params.id } });
    if (!sig) return NextResponse.json({ error: 'not found' }, { status: 404 });
    const buf = await readFileByKey(sig.imageKey);
    const key = sig.imageKey.toLowerCase();
    const ct = key.endsWith('.pdf')
      ? 'application/pdf'
      : key.endsWith('.png')
      ? 'image/png'
      : 'image/jpeg';
    return new NextResponse(buf, {
      status: 200,
      headers: {
        'content-type': ct,
        'cache-control': 'private, max-age=300',
      },
    });
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
