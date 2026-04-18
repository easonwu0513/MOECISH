import { NextResponse } from 'next/server';
import ExcelJS from 'exceljs';
import { prisma } from '@/lib/db';
import { assertCycleAccess, AuthError } from '@/lib/rbac';
import { DIMENSION_LABELS } from '@/lib/dimension';
import { COMPLIANCE_LABELS, type ComplianceLevel, type Dimension } from '@/lib/types';

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  try {
    const { cycle } = await assertCycleAccess(params.id);

    const data = await prisma.auditCycle.findUnique({
      where: { id: cycle.id },
      include: {
        organization: true,
        checklistVersion: { include: { items: { orderBy: { orderIndex: 'asc' } } } },
        responses: {
          include: { comments: { orderBy: { createdAt: 'asc' } } },
        },
      },
    });
    if (!data) return NextResponse.json({ error: 'not found' }, { status: 404 });

    const responsesByItem = new Map(data.responses.map((r) => [r.checklistItemId, r]));

    const wb = new ExcelJS.Workbook();
    wb.creator = 'MOECISH';
    wb.created = new Date();
    const ws = wb.addWorksheet(`${data.year - 1911}年度檢核表`, {
      views: [{ state: 'frozen', ySplit: 2 }],
    });

    ws.columns = [
      { header: '構面', key: 'dim', width: 28 },
      { header: '編號', key: 'no', width: 8 },
      { header: '檢核項目', key: 'content', width: 60 },
      { header: '符合', key: 'c1', width: 6 },
      { header: '部分符合', key: 'c2', width: 8 },
      { header: '不符合', key: 'c3', width: 6 },
      { header: '不適用', key: 'c4', width: 6 },
      { header: '簡述規範內容、執行方式、執行結果紀錄文件', key: 'desc', width: 60 },
      { header: '稽核委員意見', key: 'comments', width: 60 },
    ];

    // Title row
    ws.insertRow(1, [
      `${data.organization.name} ${data.year - 1911} 年度資通安全實地稽核檢核表`,
    ]);
    ws.mergeCells('A1:I1');
    const titleCell = ws.getCell('A1');
    titleCell.font = { bold: true, size: 14 };
    titleCell.alignment = { horizontal: 'center', vertical: 'middle' };
    ws.getRow(1).height = 28;

    // Style header
    const header = ws.getRow(2);
    header.font = { bold: true };
    header.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    header.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFE6ECFF' },
    };
    header.height = 30;

    const mark = (v: boolean) => (v ? 'V' : '');

    for (const item of data.checklistVersion.items) {
      const r = responsesByItem.get(item.id);
      const c = (r?.compliance ?? null) as ComplianceLevel | null;
      const commentText = (r?.comments ?? [])
        .map((cm) => `【第${cm.round}輪${cm.resolvedAt ? '·已補正' : ''}】${cm.content}`)
        .join('\n');
      ws.addRow({
        dim: DIMENSION_LABELS[item.dimension as Dimension],
        no: item.itemNo,
        content: item.content,
        c1: mark(c === 'COMPLIANT'),
        c2: mark(c === 'PARTIALLY_COMPLIANT'),
        c3: mark(c === 'NON_COMPLIANT'),
        c4: mark(c === 'NOT_APPLICABLE'),
        desc: r?.description ?? '',
        comments: commentText,
      });
    }

    // Border + wrapText for body
    const bodyStart = 3;
    const bodyEnd = bodyStart + data.checklistVersion.items.length - 1;
    for (let r = bodyStart; r <= bodyEnd; r++) {
      const row = ws.getRow(r);
      row.alignment = { vertical: 'top', wrapText: true };
      row.eachCell((cell) => {
        cell.border = {
          top: { style: 'thin', color: { argb: 'FFCCCCCC' } },
          left: { style: 'thin', color: { argb: 'FFCCCCCC' } },
          bottom: { style: 'thin', color: { argb: 'FFCCCCCC' } },
          right: { style: 'thin', color: { argb: 'FFCCCCCC' } },
        };
      });
      for (const col of ['c1', 'c2', 'c3', 'c4']) {
        row.getCell(col).alignment = { horizontal: 'center', vertical: 'middle' };
      }
    }

    // Statistics sheet
    const stat = wb.addWorksheet('統計');
    stat.columns = [
      { header: '構面', key: 'dim', width: 32 },
      { header: '總題數', key: 'total', width: 10 },
      { header: '符合', key: 'c1', width: 8 },
      { header: '部分符合', key: 'c2', width: 10 },
      { header: '不符合', key: 'c3', width: 8 },
      { header: '不適用', key: 'c4', width: 8 },
      { header: '未作答', key: 'none', width: 8 },
    ];
    stat.getRow(1).font = { bold: true };

    const dims: Dimension[] = [
      'CORE_BUSINESS', 'POLICY_ORG', 'STAFFING_BUDGET', 'ASSET_RISK', 'OUTSOURCING',
      'MAINTENANCE_KPI', 'PROTECTION_CONTROL', 'SYSTEM_DEV', 'INCIDENT_RESPONSE',
    ];
    for (const d of dims) {
      const items = data.checklistVersion.items.filter((i) => i.dimension === d);
      const resps = items.map((i) => responsesByItem.get(i.id)?.compliance ?? null);
      const count = (v: string) => resps.filter((x) => x === v).length;
      stat.addRow({
        dim: DIMENSION_LABELS[d],
        total: items.length,
        c1: count('COMPLIANT'),
        c2: count('PARTIALLY_COMPLIANT'),
        c3: count('NON_COMPLIANT'),
        c4: count('NOT_APPLICABLE'),
        none: resps.filter((x) => x == null).length,
      });
    }

    const buf = await wb.xlsx.writeBuffer();
    const filename = `${data.organization.code}_${data.year - 1911}_檢核表.xlsx`;
    return new NextResponse(Buffer.from(buf), {
      status: 200,
      headers: {
        'content-type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'content-disposition': `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
      },
    });
  } catch (e) {
    if (e instanceof AuthError) return NextResponse.json({ error: e.message }, { status: e.status });
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
