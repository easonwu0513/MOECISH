import {
  Document, Paragraph, TextRun, Table, TableRow, TableCell,
  WidthType, AlignmentType, HeadingLevel, BorderStyle, TableLayoutType,
} from 'docx';
import {
  DEFICIENCY_ASPECT_LABELS,
  DEFICIENCY_TYPE_LABELS,
  EXEC_STATUS_LABELS,
  type DeficiencyAspect,
  type DeficiencyType,
  type ExecStatus,
} from '@/lib/types';

// 「資通安全稽核改善暨執行情形報告」Word 產生器(純函式,無 DB/認證相依,可單獨測試)。
// 版式對齊列印報告 src/app/cycles/[id]/print/page.tsx:每筆缺失一張表,首列四欄
// 「項次｜編號｜類別｜說明」,其後各列「欄位標籤(跨首二欄)｜欄位內容(跨後二欄)」。
// ⚠️ Word 表格若缺 <w:tblGrid> 與逐格 <w:tcW>,自動佈局會把中文內容擠成一字寬直排;
// 故此處以固定版面(TableLayoutType.FIXED)+ 明確欄寬(dxa)+ 跨欄(columnSpan)鎖定幾何。

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

// A4 直式、邊界 2.54cm 時可用內容寬 ≈ 9,026 dxa(11906 − 2×1440)。四欄總寬取 9,020(留餘裕)。
// 首二欄合計即為欄位標籤區、後二欄合計即為欄位內容區(對齊列印版 colSpan=2/2)。
const COL = { itemLabel: 1040, itemNo: 720, typeLabel: 1440, content: 5820 };
const GRID = [COL.itemLabel, COL.itemNo, COL.typeLabel, COL.content];
const GRID_TOTAL = GRID.reduce((a, b) => a + b, 0);
const LABEL_SPAN2 = COL.itemLabel + COL.itemNo;    // 欄位標籤跨首二欄
const CONTENT_SPAN2 = COL.typeLabel + COL.content; // 欄位內容跨後二欄

/** 將含換行的顯示字串拆為多段落(對齊列印版以 <br/> 斷行的雙行標籤)。 */
function cellParagraphs(text: string, bold: boolean) {
  return (text.length ? text : '').split('\n').map(
    (line) => new Paragraph({ children: [new TextRun({ text: line, bold, size: 20 })] }),
  );
}

function headerCell(text: string, width: number, span?: number) {
  return new TableCell({
    width: { size: width, type: WidthType.DXA },
    columnSpan: span,
    shading: { fill: 'F1F3F5' },
    borders: CELL_BORDER,
    children: cellParagraphs(text, true),
  });
}

function bodyCell(text: string, width: number, span?: number) {
  return new TableCell({
    width: { size: width, type: WidthType.DXA },
    columnSpan: span,
    borders: CELL_BORDER,
    children: cellParagraphs(text, false),
  });
}

export type RemediationAction = {
  rootCause?: string | null;
  measureStrategy?: string | null;
  measureManagement?: string | null;
  measureTechnical?: string | null;
  execStatus?: string | null;
  actualDate?: Date | null;
  extendedDate?: Date | null;
  delayReason?: string | null;
  plannedDate?: Date | null;
  trackingMethod?: string | null;
};

export type RemediationDeficiency = {
  itemNo: number;
  aspect: string;
  type: string;
  description: string;
  action?: RemediationAction | null;
};

export type RemediationReportInput = {
  year: number;
  organizationName: string;
  onsiteDate?: Date | null;
  startDate?: Date | null;
  deficiencies: RemediationDeficiency[];
};

/** 產生單筆缺失的一張表(五列;固定版面 + 明確欄寬 + 跨欄)。 */
function deficiencyTable(d: RemediationDeficiency): Table {
  const type = d.type as DeficiencyType;
  const a = d.action;
  const measures: string[] = [];
  if (a?.measureStrategy) measures.push(`■ 策略面調整：${a.measureStrategy}`);
  if (a?.measureManagement) measures.push(`■ 管理面調整：${a.measureManagement}`);
  if (a?.measureTechnical) measures.push(`■ 技術面調整：${a.measureTechnical}`);

  const exec = (a?.execStatus ?? null) as ExecStatus | null;
  let execLine = exec ? `■ ${EXEC_STATUS_LABELS[exec]}` : '';
  if (exec === 'ON_TIME_DONE' || exec === 'LATE_DONE') execLine += `（實際完成日期 ${rocDate(a?.actualDate)}）`;
  if (exec === 'LATE_IN_PROGRESS') execLine += `（預計完成日期延長至 ${rocDate(a?.extendedDate)}）`;
  if ((exec === 'LATE_DONE' || exec === 'LATE_IN_PROGRESS') && a?.delayReason) execLine += `，原因：${a.delayReason}`;

  const schedule =
    (a?.plannedDate ? `預計完成時程：${rocDate(a.plannedDate)}\n` : '') +
    (a?.trackingMethod ? `進度追蹤方式：${a.trackingMethod}` : '');

  return new Table({
    width: { size: GRID_TOTAL, type: WidthType.DXA },
    columnWidths: GRID,
    layout: TableLayoutType.FIXED,
    rows: [
      new TableRow({
        children: [
          headerCell('項次', COL.itemLabel),
          bodyCell(String(d.itemNo), COL.itemNo),
          headerCell(DEFICIENCY_TYPE_LABELS[type], COL.typeLabel),
          bodyCell(d.description, COL.content),
        ],
      }),
      new TableRow({ children: [headerCell('發生原因\n（根因分析）', LABEL_SPAN2, 2), bodyCell(a?.rootCause ?? '', CONTENT_SPAN2, 2)] }),
      new TableRow({ children: [headerCell('改善措施\n（可複選）', LABEL_SPAN2, 2), bodyCell(measures.join('\n'), CONTENT_SPAN2, 2)] }),
      new TableRow({ children: [headerCell('預計完成時程及\n進度追蹤方式', LABEL_SPAN2, 2), bodyCell(schedule, CONTENT_SPAN2, 2)] }),
      new TableRow({ children: [headerCell('執行情形', LABEL_SPAN2, 2), bodyCell(execLine, CONTENT_SPAN2, 2)] }),
    ],
  });
}

/** 組出整份改善報告的 docx Document(版式對齊列印 PDF 版)。 */
export function buildRemediationReportDocument(input: RemediationReportInput): Document {
  const children: (Paragraph | Table)[] = [];

  // 標題
  children.push(
    new Paragraph({
      alignment: AlignmentType.CENTER,
      heading: HeadingLevel.HEADING_1,
      children: [new TextRun({ text: `${input.year - 1911} 年度${input.organizationName}`, bold: true, size: 30 })],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [new TextRun({ text: '資通安全稽核改善暨執行情形報告', bold: true, size: 30 })],
      spacing: { after: 300 },
    }),
    new Paragraph({ children: [new TextRun({ text: `受稽機關：${input.organizationName}`, size: 22 })] }),
    new Paragraph({ children: [new TextRun({ text: `受稽日期：${rocDate(input.onsiteDate ?? input.startDate)}`, size: 22 })] }),
    new Paragraph({
      children: [new TextRun({ text: `文件填寫日期：${rocDate(new Date())}`, size: 22 })],
      spacing: { after: 300 },
    }),
  );

  const aspects: DeficiencyAspect[] = ['STRATEGY', 'MANAGEMENT', 'TECHNICAL'];
  const types: DeficiencyType[] = ['IMPROVE', 'SUGGEST'];

  for (const aspect of aspects) {
    const inAspect = input.deficiencies.filter((d) => d.aspect === aspect);
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
        children.push(
          deficiencyTable(d),
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

  return new Document({
    sections: [{
      properties: {
        // A4 直式、邊界 2.54cm(與列印版 @page { size: A4; margin: 2.54cm } 一致)
        page: {
          size: { width: 11906, height: 16838 },
          margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 },
        },
      },
      children,
    }],
  });
}
