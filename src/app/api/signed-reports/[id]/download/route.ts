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
    // 用印掃描檔=機關密件,對象=中心(全部)+ 該機關管理員(自家)。改為 allowlist:委員/觀察員/
    // 他機關一律拒絕(原 denylist 讓「未列舉角色」——含批30 新增的觀察員——直接掉出兩個 if 拿到檔案,
    // 且未經 assertCycleAccess=跨機關 IDOR,任何登入者可枚舉 id 下載全平台用印報告;批30 對抗審查 P0)。
    // 與 access-policy 'signedReport.section'(role !== 'AUDITOR')一致:委員本不參與用印收尾。
    const canDownload =
      user.role === 'SUPER_ADMIN' ||
      (user.role === 'ORG_ADMIN' && cycle.organizationId === user.organizationId);
    if (!canDownload) {
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
