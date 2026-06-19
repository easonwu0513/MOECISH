import { NextResponse } from 'next/server';
import ExcelJS from 'exceljs';
import { prisma } from '@/lib/db';
import { assertCycleAccess } from '@/lib/rbac';
import { errorResponse } from '@/lib/api';
import type { DeficiencyAspect, DeficiencyType } from '@/lib/types';
import { writeAuditLog, extractRequestMeta } from '@/lib/audit-log';

type ParsedRow = {
  aspect: DeficiencyAspect;
  type: DeficiencyType;
  itemNo: number;
  description: string;
  checklistRef?: string;
};

/**
 * 解析教育部「資通安全稽核改善暨執行情形報告」範本。
 * 寬鬆策略：
 * - 構面由含「策略面 / 管理面 / 技術面」的列偵測
 * - 子表頭由「項次」+「待改善事項 / 建議事項」偵測
 * - 資料列 = 第 1 欄為數字 + 第 2 欄有內容
 * - 檢核項參照從描述尾端「(x.y)」樣式擷取
 */
function parseWorkbook(ws: ExcelJS.Worksheet): ParsedRow[] {
  const rows: ParsedRow[] = [];
  let aspect: DeficiencyAspect | null = null;
  let type: DeficiencyType | null = null;

  ws.eachRow({ includeEmpty: false }, (row) => {
    const c1 = String(row.getCell(1).text ?? '').trim();
    const c2 = String(row.getCell(2).text ?? '').trim();

    // 構面標題列
    if (/策略面/.test(c1)) { aspect = 'STRATEGY'; type = null; return; }
    if (/管理面/.test(c1)) { aspect = 'MANAGEMENT'; type = null; return; }
    if (/技術面/.test(c1)) { aspect = 'TECHNICAL'; type = null; return; }

    // 子表頭列
    if (c1 === '項次') {
      if (/待改善/.test(c2)) type = 'IMPROVE';
      else if (/建議/.test(c2)) type = 'SUGGEST';
      return;
    }

    // 資料列
    const no = Number(c1);
    if (aspect && type && Number.isInteger(no) && no > 0 && c2.length >= 10) {
      const refMatch = c2.match(/[（(]([0-9]+(?:\.[0-9]+)*(?:[、,][0-9]+(?:\.[0-9]+)*)*)[)）]\s*$/);
      rows.push({
        aspect,
        type,
        itemNo: no,
        description: c2,
        checklistRef: refMatch?.[1],
      });
    }
  });

  return rows;
}

export async function POST(req: Request, { params }: { params: { id: string } }) {
  try {
    const { user, cycle } = await assertCycleAccess(params.id);
    if (user.role !== 'SUPER_ADMIN') {
      return NextResponse.json({ error: '僅最高管理員可匯入缺失' }, { status: 403 });
    }
    if (cycle.status === 'CLOSED') {
      return NextResponse.json({ error: '已結案的週期不可匯入' }, { status: 400 });
    }

    const url = new URL(req.url);
    const dryRun = url.searchParams.get('dryRun') === '1';

    const fd = await req.formData();
    const file = fd.get('file') as File | null;
    if (!file) return NextResponse.json({ error: '請選擇 Excel 檔案' }, { status: 400 });
    if (file.size > 10 * 1024 * 1024) {
      return NextResponse.json({ error: '檔案超過 10MB 上限' }, { status: 400 });
    }

    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(await file.arrayBuffer());
    const ws = wb.worksheets[0];
    if (!ws) return NextResponse.json({ error: '找不到工作表' }, { status: 400 });

    const parsed = parseWorkbook(ws);
    if (parsed.length === 0) {
      return NextResponse.json(
        { error: '未解析到任何缺失，請確認檔案為教育部改善報告範本格式' },
        { status: 400 },
      );
    }

    if (dryRun) {
      return NextResponse.json({ preview: parsed, count: parsed.length });
    }

    // 寫入(項次接續既有最大值,避免與已建立者衝突)
    const existing = await prisma.deficiency.findMany({
      where: { cycleId: cycle.id },
      select: { aspect: true, type: true, itemNo: true },
    });
    const maxNo = new Map<string, number>();
    for (const d of existing) {
      const k = `${d.aspect}|${d.type}`;
      maxNo.set(k, Math.max(maxNo.get(k) ?? 0, d.itemNo));
    }

    // 整批匯入包進單一交易:任一筆失敗則全數回滾,避免半套缺失
    const created = await prisma.$transaction(async (tx) => {
      let n = 0;
      for (const r of parsed) {
        const k = `${r.aspect}|${r.type}`;
        const next = (maxNo.get(k) ?? 0) + 1;
        maxNo.set(k, next);
        await tx.deficiency.create({
          data: {
            cycleId: cycle.id,
            aspect: r.aspect,
            type: r.type,
            itemNo: next,
            description: r.description,
            checklistRef: r.checklistRef ?? null,
            createdById: user.id,
            action: { create: {} },
          },
        });
        n++;
      }
      return n;
    });

    const meta = extractRequestMeta(req);
    await writeAuditLog({
      actorId: user.id,
      action: 'DEFICIENCY_IMPORT',
      entityType: 'AuditCycle',
      entityId: cycle.id,
      after: { created },
      ...meta,
    });

    return NextResponse.json({ created });
  } catch (e) {
    return errorResponse(e);
  }
}
