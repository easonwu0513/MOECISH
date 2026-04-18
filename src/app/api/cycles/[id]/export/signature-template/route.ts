import { NextResponse } from 'next/server';
import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  HeadingLevel,
  AlignmentType,
  Table,
  TableRow,
  TableCell,
  WidthType,
  BorderStyle,
} from 'docx';
import { prisma } from '@/lib/db';
import { assertCycleAccess, AuthError } from '@/lib/rbac';

const border = {
  top: { style: BorderStyle.SINGLE, size: 6, color: '555555' },
  bottom: { style: BorderStyle.SINGLE, size: 6, color: '555555' },
  left: { style: BorderStyle.SINGLE, size: 6, color: '555555' },
  right: { style: BorderStyle.SINGLE, size: 6, color: '555555' },
};

function p(text: string, bold = false, size = 22) {
  return new Paragraph({
    children: [new TextRun({ text, bold, size })],
  });
}

function labelCell(text: string, width: number) {
  return new TableCell({
    width: { size: width, type: WidthType.PERCENTAGE },
    borders: border,
    shading: { fill: 'EEF2FF' },
    children: [p(text, true)],
  });
}

function blankCell(width: number, rows = 1) {
  const lines: Paragraph[] = [];
  for (let i = 0; i < rows; i++) lines.push(p(''));
  return new TableCell({
    width: { size: width, type: WidthType.PERCENTAGE },
    borders: border,
    children: lines,
  });
}

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  try {
    const { cycle } = await assertCycleAccess(params.id);
    const data = await prisma.auditCycle.findUnique({
      where: { id: cycle.id },
      include: { organization: true },
    });
    if (!data) return NextResponse.json({ error: 'not found' }, { status: 404 });

    const children: (Paragraph | Table)[] = [
      new Paragraph({
        heading: HeadingLevel.HEADING_1,
        alignment: AlignmentType.CENTER,
        children: [new TextRun({ text: '資通安全稽核填報簽章頁', bold: true, size: 32 })],
      }),
      new Paragraph({
        alignment: AlignmentType.CENTER,
        children: [new TextRun({ text: `${data.organization.name}　${data.year - 1911} 年度`, size: 24 })],
      }),
      p(''),
      p('本簽章頁用於受稽機關核對檢核表填報內容並用印。請列印後簽章、用印，掃描成 PDF 或 JPG 後回傳至系統。', false, 20),
      p(''),
    ];

    const table = new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      rows: [
        new TableRow({
          children: [
            labelCell('單位名稱', 20),
            blankCell(30, 1),
            labelCell('填報時間', 20),
            blankCell(30, 1),
          ],
        }),
        new TableRow({
          children: [
            labelCell('填報人', 20),
            blankCell(30, 1),
            labelCell('聯絡電話', 20),
            blankCell(30, 1),
          ],
        }),
        new TableRow({
          children: [
            labelCell('填報人簽章', 20),
            blankCell(30, 6),
            labelCell('單位主管簽章', 20),
            blankCell(30, 6),
          ],
        }),
      ],
    });

    children.push(table, p(''), p('※ 簽章後掃描回傳，系統將自動記錄上傳者、時間、IP 與檔案雜湊。', false, 18));

    const doc = new Document({
      creator: 'MOECISH',
      title: '填報簽章頁',
      styles: { default: { document: { run: { font: 'Microsoft JhengHei', size: 22 } } } },
      sections: [{ properties: {}, children }],
    });

    const buf = await Packer.toBuffer(doc);
    const filename = `${data.organization.code}_${data.year - 1911}_簽章頁範本.docx`;

    return new NextResponse(buf, {
      status: 200,
      headers: {
        'content-type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'content-disposition': `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
      },
    });
  } catch (e) {
    if (e instanceof AuthError) return NextResponse.json({ error: e.message }, { status: e.status });
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
