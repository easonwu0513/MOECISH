import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireUser } from '@/lib/rbac';
import { readFileByKey } from '@/lib/storage';
import { errorResponse } from '@/lib/api';

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  try {
    const user = await requireUser();
    const report = await prisma.signedReport.findUnique({
      where: { id: params.id },
      include: { cycle: { include: { assignments: true } } },
    });
    if (!report) return NextResponse.json({ error: 'not found' }, { status: 404 });

    const cycle = report.cycle;
    if (user.role === 'ORG_ADMIN' && cycle.organizationId !== user.organizationId) {
      return NextResponse.json({ error: 'forbidden' }, { status: 403 });
    }
    if (user.role === 'AUDITOR' && !cycle.assignments.some((a) => a.auditorId === user.id)) {
      return NextResponse.json({ error: 'forbidden' }, { status: 403 });
    }

    const buf = await readFileByKey(report.fileKey);
    const ext = report.fileName.toLowerCase();
    const ct = ext.endsWith('.pdf')
      ? 'application/pdf'
      : ext.endsWith('.png')
      ? 'image/png'
      : 'image/jpeg';
    return new NextResponse(new Uint8Array(buf), {
      status: 200,
      headers: {
        'content-type': ct,
        'content-disposition': `attachment; filename*=UTF-8''${encodeURIComponent(report.fileName)}`,
      },
    });
  } catch (e) {
    return errorResponse(e);
  }
}
