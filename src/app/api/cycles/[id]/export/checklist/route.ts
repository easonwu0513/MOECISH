import { NextResponse } from 'next/server';
import ExcelJS from 'exceljs';
import {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  WidthType, AlignmentType, BorderStyle, PageOrientation,
} from 'docx';
import { prisma } from '@/lib/db';
import { assertCycleAccess } from '@/lib/rbac';
import { errorResponse } from '@/lib/api';
import { DIMENSION_LABELS, DIMENSION_ORDER } from '@/lib/dimension';
import { type ComplianceLevel, type Dimension } from '@/lib/types';

type Loaded = NonNullable<Awaited<ReturnType<typeof loadCycle>>>;

async function loadCycle(id: string) {
  return prisma.auditCycle.findUnique({
    where: { id },
    include: {
      organization: true,
      checklistVersion: { include: { items: { orderBy: { orderIndex: 'asc' } } } },
      responses: { include: { comments: { orderBy: { createdAt: 'asc' } } } },
    },
  });
}

/** 檢核表匯出:?format=docx 出制式 Word(遞交格式),預設 Excel(工作底稿)。 */
export async function GET(req: Request, { params }: { params: { id: string } }) {
  try {
    const { cycle } = await assertCycleAccess(params.id);
    const data = await loadCycle(cycle.id);
    if (!data) return NextResponse.json({ error: 'not found' }, { status: 404 });

    const format = new URL(req.url).searchParams.get('format');
    return format === 'docx' ? exportDocx(data) : exportXlsx(data);
  } catch (e) {
    return errorResponse(e);
  }
}

// ─────────────────────────────────────────────
// Word 制式版(版式對齊行政院檢核表:■ 勾選 + 簡述 + 紀錄文件)
// ─────────────────────────────────────────────

const CELL_BORDER = {
  top: { style: BorderStyle.SINGLE, size: 4, color: '444444' },
  bottom: { style: BorderStyle.SINGLE, size: 4, color: '444444' },
  left: { style: BorderStyle.SINGLE, size: 4, color: '444444' },
  right: { style: BorderStyle.SINGLE, size: 4, color: '444444' },
};

function hCell(text: string, widthPct: number) {
  return new TableCell({
    width: { size: widthPct, type: WidthType.PERCENTAGE },
    shading: { fill: 'F1F3F5' },
    borders: CELL_BORDER,
    children: [new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [new TextRun({ text, bold: true, size: 20 })],
    })],
  });
}

function tCell(text: string, widthPct?: number, opts?: { center?: boolean }) {
  return new TableCell({
    width: widthPct ? { size: widthPct, type: WidthType.PERCENTAGE } : undefined,
    borders: CELL_BORDER,
    children: (text || '').split('\n').map(
      (line) => new Paragraph({
        alignment: opts?.center ? AlignmentType.CENTER : undefined,
        children: [new TextRun({ text: line, size: 20 })],
      }),
    ),
  });
}

const COMPLIANCE_ROWS: { level: ComplianceLevel; label: string }[] = [
  { level: 'COMPLIANT', label: '符合' },
  { level: 'PARTIALLY_COMPLIANT', label: '部分符合' },
  { level: 'NON_COMPLIANT', label: '不符合' },
  { level: 'NOT_APPLICABLE', label: '不適用' },
];

function complianceCell(c: ComplianceLevel | null, widthPct: number) {
  return new TableCell({
    width: { size: widthPct, type: WidthType.PERCENTAGE },
    borders: CELL_BORDER,
    children: COMPLIANCE_ROWS.map(
      ({ level, label }) => new Paragraph({
        children: [new TextRun({ text: `${c === level ? '■' : '□'}${label}`, size: 18 })],
      }),
    ),
  });
}

async function exportDocx(data: Loaded) {
  const responsesByItem = new Map(data.responses.map((r) => [r.checklistItemId, r]));
  const yearROC = data.year - 1911;

  const children: (Paragraph | Table)[] = [
    new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [new TextRun({ text: `${yearROC} 年度資通安全實地稽核項目檢核表`, bold: true, size: 30 })],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 200 },
      children: [new TextRun({ text: `受稽機關:${data.organization.name}`, size: 24 })],
    }),
  ];

  for (const dim of DIMENSION_ORDER) {
    const items = data.checklistVersion.items.filter((i) => i.dimension === dim);
    if (items.length === 0) continue;

    children.push(
      new Paragraph({
        spacing: { before: 240, after: 120 },
        children: [new TextRun({ text: DIMENSION_LABELS[dim as Dimension], bold: true, size: 24 })],
      }),
    );

    const rows: TableRow[] = [
      new TableRow({
        tableHeader: true,
        children: [
          hCell('項次', 6),
          hCell('檢核項目', 40),
          hCell('檢核情形', 13),
          hCell('簡述規範內容、執行方式、執行結果', 26),
          hCell('紀錄文件', 15),
        ],
      }),
      ...items.map((item) => {
        const r = responsesByItem.get(item.id);
        return new TableRow({
          children: [
            tCell(item.itemNo, 6, { center: true }),
            tCell(item.content, 40),
            complianceCell((r?.compliance ?? null) as ComplianceLevel | null, 13),
            tCell(r?.description ?? '', 26),
            tCell(r?.recordDocs ?? '', 15),
          ],
        });
      }),
    ];

    children.push(new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows }));
  }

  // 簽名欄(遞交版常見收尾)
  children.push(
    new Paragraph({ spacing: { before: 400 }, children: [new TextRun({ text: '填表人:', size: 24 })] }),
    new Paragraph({ spacing: { before: 200 }, children: [new TextRun({ text: '資安長(或機關首長授權代表):', size: 24 })] }),
  );

  const doc = new Document({
    sections: [{
      properties: { page: { size: { orientation: PageOrientation.LANDSCAPE } } },
      children,
    }],
  });

  const buf = await Packer.toBuffer(doc);
  const filename = `${data.organization.code}_${yearROC}_檢核表.docx`;
  return new NextResponse(new Uint8Array(buf), {
    status: 200,
    headers: {
      'content-type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'content-disposition': `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
    },
  });
}

// ─────────────────────────────────────────────
// Excel 工作底稿版(含委員意見與統計)
// ─────────────────────────────────────────────

async function exportXlsx(data: Loaded) {
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
    { header: '簡述規範內容、執行方式、執行結果', key: 'desc', width: 60 },
    { header: '紀錄文件', key: 'docs', width: 30 },
    { header: '稽核委員意見', key: 'comments', width: 60 },
  ];

  // Title row
  ws.insertRow(1, [
    `${data.organization.name} ${data.year - 1911} 年度資通安全實地稽核檢核表`,
  ]);
  ws.mergeCells('A1:J1');
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
      docs: r?.recordDocs ?? '',
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

  for (const d of DIMENSION_ORDER) {
    const items = data.checklistVersion.items.filter((i) => i.dimension === d);
    const resps = items.map((i) => responsesByItem.get(i.id)?.compliance ?? null);
    const count = (v: string) => resps.filter((x) => x === v).length;
    stat.addRow({
      dim: DIMENSION_LABELS[d as Dimension],
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
}
