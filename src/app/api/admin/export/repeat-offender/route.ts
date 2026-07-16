import { NextResponse } from 'next/server';
import ExcelJS from 'exceljs';
import { requireRole } from '@/lib/rbac';
import { errorResponse } from '@/lib/api';
import { findRepeatOffenders } from '@/lib/deficiency-history';
import { ACTION_STATUS_LABELS, type ActionStatus } from '@/lib/types';

/**
 * 歷年重複缺失(repeat-offender)彙整表(Excel)— 中心系統性政策介入依據。
 * 列出「同機關 × 同檢核項(或同構面)在 ≥2 個不同年度重複」者,僅 SUPER_ADMIN 可下載。
 */
export async function GET(req: Request) {
  try {
    await requireRole('SUPER_ADMIN');
    const url = new URL(req.url);
    const yearParam = url.searchParams.get('year');
    const maxYear = yearParam ? Number(yearParam) : undefined;

    const offenders = await findRepeatOffenders({ maxYear });

    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('歷年重複缺失');

    ws.columns = [
      { header: '機關', key: 'org', width: 24 },
      { header: '歸併依據', key: 'group', width: 16 },
      { header: '構面/檢核項', key: 'label', width: 16 },
      { header: '重複年度數', key: 'count', width: 12 },
      { header: '首次年度', key: 'first', width: 10 },
      { header: '最近年度', key: 'last', width: 10 },
      { header: '各年度出現（年度→最近矯正狀態）', key: 'detail', width: 50 },
    ];
    ws.getRow(1).font = { bold: true };
    ws.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF1F3F5' } };
    ws.views = [{ state: 'frozen', ySplit: 1 }];

    for (const o of offenders) {
      ws.addRow({
        org: o.organizationName,
        group: o.groupKind === 'ref' ? '檢核項' : '構面',
        label: o.groupLabel,
        count: o.occurrenceCount,
        first: o.firstYearROC,
        last: o.lastYearROC,
        detail: o.occurrences
          .map((x) => `${x.yearROC}→${ACTION_STATUS_LABELS[x.status as ActionStatus] ?? x.status}`)
          .join('、'),
      });
    }
    ws.getColumn('detail').alignment = { wrapText: true, vertical: 'top' };

    if (offenders.length === 0) {
      ws.addRow({ org: '（無跨年度重複缺失）' });
    }

    const buf = await wb.xlsx.writeBuffer();
    const filename = `MOECISH_歷年重複缺失彙整表${maxYear ? `_至${maxYear - 1911}年度` : ''}.xlsx`;

    return new NextResponse(new Uint8Array(buf as ArrayBuffer), {
      status: 200,
      headers: {
        'content-type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'content-disposition': `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
      },
    });
  } catch (e) {
    return errorResponse(e);
  }
}
