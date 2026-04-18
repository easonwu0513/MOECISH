import { NextResponse } from 'next/server';
import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  HeadingLevel,
  Table,
  TableRow,
  TableCell,
  WidthType,
  AlignmentType,
  BorderStyle,
} from 'docx';
import { prisma } from '@/lib/db';
import { assertCycleAccess, AuthError } from '@/lib/rbac';
import {
  FINDING_ASPECT_LABELS,
  FINDING_TYPE_LABELS,
  type FindingAspect,
  type FindingType,
  type Dimension,
} from '@/lib/types';
import { DIMENSION_LABELS } from '@/lib/dimension';

const border = {
  top: { style: BorderStyle.SINGLE, size: 4, color: '888888' },
  bottom: { style: BorderStyle.SINGLE, size: 4, color: '888888' },
  left: { style: BorderStyle.SINGLE, size: 4, color: '888888' },
  right: { style: BorderStyle.SINGLE, size: 4, color: '888888' },
};

function p(text: string, opts: { bold?: boolean; size?: number } = {}) {
  return new Paragraph({
    children: [new TextRun({ text, bold: opts.bold, size: opts.size ?? 22 })],
  });
}

function cell(text: string, width: number) {
  return new TableCell({
    width: { size: width, type: WidthType.PERCENTAGE },
    borders: border,
    children: text
      ? text.split('\n').map((line) => p(line))
      : [p('')],
  });
}

function labelCell(text: string) {
  return new TableCell({
    width: { size: 22, type: WidthType.PERCENTAGE },
    borders: border,
    shading: { fill: 'EEF2FF' },
    children: [p(text, { bold: true })],
  });
}

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  try {
    const { cycle } = await assertCycleAccess(params.id);
    const data = await prisma.auditCycle.findUnique({
      where: { id: cycle.id },
      include: {
        organization: true,
        findings: {
          include: { remediation: { include: { decisions: { orderBy: { round: 'asc' } } } } },
          orderBy: [{ findingNo: 'asc' }],
        },
        signatures: { orderBy: { signedAt: 'desc' } },
      },
    });
    if (!data) return NextResponse.json({ error: 'not found' }, { status: 404 });

    const children: (Paragraph | Table)[] = [];

    children.push(
      new Paragraph({
        heading: HeadingLevel.HEADING_1,
        alignment: AlignmentType.CENTER,
        children: [new TextRun({ text: '資通安全稽核改善暨執行情形報告', bold: true, size: 32 })],
      }),
      new Paragraph({
        alignment: AlignmentType.CENTER,
        children: [
          new TextRun({
            text: `${data.organization.name}　${data.year - 1911} 年度`,
            size: 24,
          }),
        ],
      }),
      p(''),
    );

    const needs = data.findings.filter((f) => f.type === 'NEEDS_IMPROVEMENT');

    if (needs.length === 0) {
      children.push(p('本年度無待改善事項。'));
    }

    for (const f of needs) {
      const r = f.remediation;
      const tags: string[] = (() => {
        try { return r?.actionTagsJson ? JSON.parse(r.actionTagsJson) : []; }
        catch { return []; }
      })();

      children.push(
        new Paragraph({
          heading: HeadingLevel.HEADING_2,
          children: [
            new TextRun({
              text: `【${f.findingNo}】${FINDING_ASPECT_LABELS[f.aspect as FindingAspect]} — ${f.title}`,
              bold: true,
              size: 26,
            }),
          ],
        }),
        p(`類型：${FINDING_TYPE_LABELS[f.type as FindingType]}　構面：${DIMENSION_LABELS[f.dimension as Dimension]}`),
        p('稽核意見：', { bold: true }),
        ...f.description.split('\n').map((l) => p(l)),
        p(''),
      );

      const rows: TableRow[] = [
        new TableRow({
          children: [
            labelCell('發生原因（根因分析）'),
            cell(r?.rootCause ?? '', 78),
          ],
        }),
        new TableRow({
          children: [
            labelCell('改善措施'),
            cell(
              [
                tags.length ? `標記：${tags.join('、')}` : '',
                r?.actions ?? '',
              ].filter(Boolean).join('\n'),
              78,
            ),
          ],
        }),
        new TableRow({
          children: [
            labelCell('預計完成時程'),
            cell(r?.plannedDueDate ? new Date(r.plannedDueDate).toLocaleDateString('zh-TW') : '', 78),
          ],
        }),
        new TableRow({
          children: [
            labelCell('進度追蹤方式'),
            cell(r?.trackingMethod ?? '', 78),
          ],
        }),
        new TableRow({
          children: [
            labelCell('執行情形'),
            cell(r?.executionStatus ?? '', 78),
          ],
        }),
      ];

      children.push(
        new Table({
          rows,
          width: { size: 100, type: WidthType.PERCENTAGE },
        }),
      );

      if (r && r.decisions.length > 0) {
        children.push(p(''));
        children.push(p('審核紀錄：', { bold: true }));
        for (const d of r.decisions) {
          children.push(
            p(
              `　第 ${d.round} 輪 · ${d.decision === 'APPROVED' ? '審核通過' : '持續改正'} · ${new Date(d.decidedAt).toLocaleString('zh-TW')}${d.comment ? `\n　　${d.comment}` : ''}`,
            ),
          );
        }
      }

      children.push(p(''));
    }

    // Signatures
    const respSig = data.signatures.find((s) => s.signerRole === 'RESPONDENT');
    const supSig = data.signatures.find((s) => s.signerRole === 'SUPERVISOR');

    children.push(
      p(''),
      new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        rows: [
          new TableRow({
            children: [
              labelCell('單位名稱'),
              cell(data.organization.name, 28),
              labelCell('填報時間'),
              cell(new Date().toLocaleDateString('zh-TW'), 28),
            ],
          }),
          new TableRow({
            children: [
              labelCell('填報人簽章'),
              cell(respSig ? `${respSig.signerName}（電子簽章 · ${new Date(respSig.signedAt).toLocaleDateString('zh-TW')}）` : '（尚未簽章）', 28),
              labelCell('單位主管簽章'),
              cell(supSig ? `${supSig.signerName}（電子簽章 · ${new Date(supSig.signedAt).toLocaleDateString('zh-TW')}）` : '（尚未簽章）', 28),
            ],
          }),
        ],
      }),
    );

    const doc = new Document({
      creator: 'MOECISH',
      title: '資通安全稽核改善暨執行情形報告',
      styles: {
        default: {
          document: {
            run: { font: 'Microsoft JhengHei', size: 22 },
          },
        },
      },
      sections: [{ properties: {}, children }],
    });

    const buf = await Packer.toBuffer(doc);
    const filename = `${data.organization.code}_${data.year - 1911}_改善執行情形報告.docx`;

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
