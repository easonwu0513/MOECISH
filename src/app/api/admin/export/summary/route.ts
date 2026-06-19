import { NextResponse } from 'next/server';
import ExcelJS from 'exceljs';
import { prisma } from '@/lib/db';
import { requireRole } from '@/lib/rbac';
import { errorResponse } from '@/lib/api';
import {
  DEFICIENCY_ASPECT_LABELS,
  DEFICIENCY_TYPE_LABELS,
  ACTION_STATUS_LABELS,
  EXEC_STATUS_LABELS,
  type DeficiencyAspect,
  type DeficiencyType,
  type ActionStatus,
  type ExecStatus,
} from '@/lib/types';
import { CYCLE_STATUS_LABELS } from '@/lib/state-machine';
import type { CycleStatus } from '@/lib/types';
import { rocDateDotted as rocDate } from '@/lib/date';

/** 全機關改善情形彙整表(Excel)— SUPER_ADMIN 對外回報用 */
export async function GET(req: Request) {
  try {
    await requireRole('SUPER_ADMIN');
    const url = new URL(req.url);
    const yearParam = url.searchParams.get('year');
    const year = yearParam ? Number(yearParam) : undefined;

    const cycles = await prisma.auditCycle.findMany({
      where: year ? { year } : {},
      include: {
        organization: true,
        deficiencies: {
          include: { action: true },
          orderBy: [{ aspect: 'asc' }, { type: 'asc' }, { itemNo: 'asc' }],
        },
      },
      orderBy: [{ year: 'desc' }, { createdAt: 'asc' }],
    });

    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('彙整表');

    ws.columns = [
      { header: '年度', key: 'year', width: 8 },
      { header: '機關', key: 'org', width: 22 },
      { header: '週期狀態', key: 'cstatus', width: 12 },
      { header: '構面', key: 'aspect', width: 10 },
      { header: '類型', key: 'type', width: 12 },
      { header: '項次', key: 'no', width: 6 },
      { header: '缺失描述', key: 'desc', width: 60 },
      { header: '檢核項', key: 'ref', width: 10 },
      { header: '矯正狀態', key: 'status', width: 12 },
      { header: '輪次', key: 'round', width: 6 },
      { header: '預計完成', key: 'planned', width: 12 },
      { header: '執行情形', key: 'exec', width: 14 },
      { header: '實際完成', key: 'actual', width: 12 },
    ];
    ws.getRow(1).font = { bold: true };
    ws.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF1F3F5' } };
    ws.views = [{ state: 'frozen', ySplit: 1 }];

    for (const c of cycles) {
      for (const d of c.deficiencies) {
        const a = d.action;
        ws.addRow({
          year: c.year - 1911,
          org: c.organization.name,
          cstatus: CYCLE_STATUS_LABELS[c.status as CycleStatus] ?? c.status,
          aspect: DEFICIENCY_ASPECT_LABELS[d.aspect as DeficiencyAspect] ?? d.aspect,
          type: DEFICIENCY_TYPE_LABELS[d.type as DeficiencyType] ?? d.type,
          no: d.itemNo,
          desc: d.description,
          ref: d.checklistRef ?? '',
          status: a ? ACTION_STATUS_LABELS[a.status as ActionStatus] ?? a.status : '待填報',
          round: a?.round ?? 1,
          planned: rocDate(a?.plannedDate),
          exec: a?.execStatus ? EXEC_STATUS_LABELS[a.execStatus as ExecStatus] ?? a.execStatus : '',
          actual: rocDate(a?.actualDate),
        });
      }
    }
    ws.getColumn('desc').alignment = { wrapText: true, vertical: 'top' };

    const buf = await wb.xlsx.writeBuffer();
    const filename = `MOECISH_全機關改善情形彙整表${year ? `_${year - 1911}年度` : ''}.xlsx`;

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
