import { NextResponse } from 'next/server';
import { Packer } from 'docx';
import { prisma } from '@/lib/db';
import { assertCycleAccess } from '@/lib/rbac';
import { errorResponse } from '@/lib/api';
import { buildRemediationReportDocument } from '@/lib/remediation-report';

/** 產出「資通安全稽核改善暨執行情形報告」Word(版式對齊列印 PDF 版) */
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  try {
    const { user } = await assertCycleAccess(params.id);
    // 委員不匯出改善報告(僅於系統內檢視機關填報的矯正措施);機關/中心可匯出
    if (user.role === 'AUDITOR' || user.role === 'OBSERVER') {
      return NextResponse.json({ error: '此匯出限機關與中心；請於系統內檢視' }, { status: 403 });
    }

    const cycle = await prisma.auditCycle.findUnique({
      where: { id: params.id },
      include: {
        organization: true,
        deficiencies: {
          include: { action: true },
          orderBy: [{ aspect: 'asc' }, { type: 'asc' }, { itemNo: 'asc' }],
        },
      },
    });
    if (!cycle) return NextResponse.json({ error: '找不到資料或您無權存取' }, { status: 404 });

    const doc = buildRemediationReportDocument({
      year: cycle.year,
      organizationName: cycle.organization.name,
      onsiteDate: cycle.onsiteDate,
      startDate: cycle.startDate,
      deficiencies: cycle.deficiencies,
    });
    const buf = await Packer.toBuffer(doc);
    const filename = `${cycle.organization.code}_${cycle.year - 1911}_資通安全稽核改善暨執行情形報告` + '.docx';

    return new NextResponse(new Uint8Array(buf), {
      status: 200,
      headers: {
        'content-type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'content-disposition': `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
      },
    });
  } catch (e) {
    return errorResponse(e);
  }
}
