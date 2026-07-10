import { NextResponse } from 'next/server';
import {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  WidthType, AlignmentType, HeadingLevel, BorderStyle,
} from 'docx';
import { prisma } from '@/lib/db';
import { assertCycleAccess } from '@/lib/rbac';
import { errorResponse } from '@/lib/api';
import {
  DEFICIENCY_ASPECT_LABELS,
  DEFICIENCY_TYPE_LABELS,
  EXEC_STATUS_LABELS,
  type DeficiencyAspect,
  type DeficiencyType,
  type ExecStatus,
} from '@/lib/types';

const ASPECT_NUM: Record<DeficiencyAspect, string> = {
  STRATEGY: '一', MANAGEMENT: '二', TECHNICAL: '三',
};

function rocDate(d: Date | null | undefined): string {
  if (!d) return '';
  const dt = new Date(d);
  return `${dt.getFullYear() - 1911} 年 ${dt.getMonth() + 1} 月 ${dt.getDate()} 日`;
}

const CELL_BORDER = {
  top: { style: BorderStyle.SINGLE, size: 4, color: '444444' },
  bottom: { style: BorderStyle.SINGLE, size: 4, color: '444444' },
  left: { style: BorderStyle.SINGLE, size: 4, color: '444444' },
  right: { style: BorderStyle.SINGLE, size: 4, color: '444444' },
};

function headerCell(text: string, width?: number) {
  return new TableCell({
    width: width ? { size: width, type: WidthType.PERCENTAGE } : undefined,
    shading: { fill: 'F1F3F5' },
    borders: CELL_BORDER,
    children: [new Paragraph({ children: [new TextRun({ text, bold: true, size: 20 })] })],
  });
}
function bodyCell(text: string, width?: number) {
  return new TableCell({
    width: width ? { size: width, type: WidthType.PERCENTAGE } : undefined,
    borders: CELL_BORDER,
    children: text.split('\n').map(
      (line) => new Paragraph({ children: [new TextRun({ text: line, size: 20 })] }),
    ),
  });
}

/** 產出「資通安全稽核改善暨執行情形報告」Word(版式對齊教育部範本) */
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

    const children: (Paragraph | Table)[] = [];

    // 標題
    children.push(
      new Paragraph({
        alignment: AlignmentType.CENTER,
        heading: HeadingLevel.HEADING_1,
        children: [new TextRun({ text: `${cycle.year - 1911} 年度${cycle.organization.name}`, bold: true, size: 30 })],
      }),
      new Paragraph({
        alignment: AlignmentType.CENTER,
        children: [new TextRun({ text: '資通安全稽核改善暨執行情形報告', bold: true, size: 30 })],
        spacing: { after: 300 },
      }),
      new Paragraph({ children: [new TextRun({ text: `受稽機關：${cycle.organization.name}`, size: 22 })] }),
      new Paragraph({ children: [new TextRun({ text: `受稽日期：${rocDate(cycle.onsiteDate ?? cycle.startDate)}`, size: 22 })] }),
      new Paragraph({
        children: [new TextRun({ text: `文件填寫日期：${rocDate(new Date())}`, size: 22 })],
        spacing: { after: 300 },
      }),
    );

    const aspects: DeficiencyAspect[] = ['STRATEGY', 'MANAGEMENT', 'TECHNICAL'];
    const types: DeficiencyType[] = ['IMPROVE', 'SUGGEST'];

    for (const aspect of aspects) {
      const inAspect = cycle.deficiencies.filter((d) => d.aspect === aspect);
      if (inAspect.length === 0) continue;

      children.push(
        new Paragraph({
          children: [new TextRun({ text: `${ASPECT_NUM[aspect]}、實地稽核－${DEFICIENCY_ASPECT_LABELS[aspect]}`, bold: true, size: 26 })],
          spacing: { before: 300, after: 150 },
        }),
      );

      for (const type of types) {
        const items = inAspect.filter((d) => d.type === type);
        if (items.length === 0) continue;

        for (const d of items) {
          const a = d.action;
          const measures: string[] = [];
          if (a?.measureStrategy) measures.push(`■ 策略面調整：${a.measureStrategy}`);
          if (a?.measureManagement) measures.push(`■ 管理面調整：${a.measureManagement}`);
          if (a?.measureTechnical) measures.push(`■ 技術面調整：${a.measureTechnical}`);

          const exec = a?.execStatus as ExecStatus | null;
          let execLine = exec ? `■ ${EXEC_STATUS_LABELS[exec]}` : '';
          if (exec === 'ON_TIME_DONE' || exec === 'LATE_DONE') execLine += `（實際完成日期 ${rocDate(a?.actualDate)})`;
          if (exec === 'LATE_IN_PROGRESS') execLine += `（預計完成日期延長至 ${rocDate(a?.extendedDate)})`;
          if ((exec === 'LATE_DONE' || exec === 'LATE_IN_PROGRESS') && a?.delayReason) execLine += `，原因：${a.delayReason}`;

          const schedule =
            (a?.plannedDate ? `預計完成時程：${rocDate(a.plannedDate)}\n` : '') +
            (a?.trackingMethod ? `進度追蹤方式：${a.trackingMethod}` : '');

          children.push(
            new Table({
              width: { size: 100, type: WidthType.PERCENTAGE },
              rows: [
                new TableRow({
                  children: [
                    headerCell('項次', 8),
                    bodyCell(String(d.itemNo), 7),
                    headerCell(DEFICIENCY_TYPE_LABELS[type], 15),
                    bodyCell(d.description, 70),
                  ],
                }),
                new TableRow({ children: [headerCell('發生原因（根因分析）', 30), bodyCell(a?.rootCause ?? '', 70)] }),
                new TableRow({ children: [headerCell('改善措施（可複選）', 30), bodyCell(measures.join('\n'), 70)] }),
                new TableRow({ children: [headerCell('預計完成時程及進度追蹤方式', 30), bodyCell(schedule, 70)] }),
                new TableRow({ children: [headerCell('執行情形', 30), bodyCell(execLine, 70)] }),
              ],
            }),
            new Paragraph({ children: [], spacing: { after: 200 } }),
          );
        }
      }
    }

    // 簽名欄
    children.push(
      new Paragraph({ children: [], spacing: { before: 500 } }),
      new Paragraph({ children: [new TextRun({ text: '承辦人：', size: 24 })], spacing: { after: 500 } }),
      new Paragraph({ children: [new TextRun({ text: '單位主管：', size: 24 })], spacing: { after: 500 } }),
    );

    const doc = new Document({ sections: [{ properties: {}, children }] });
    const buf = await Packer.toBuffer(doc);
    const filename = `${cycle.organization.code}_${cycle.year - 1911}_資通安全稽核改善暨執行情形報告。docx`;

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
