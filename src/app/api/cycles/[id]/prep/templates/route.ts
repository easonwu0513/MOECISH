import { NextResponse } from 'next/server';
import AdmZip from 'adm-zip';
import { assertCycleAccess } from '@/lib/rbac';
import { readFileByKey } from '@/lib/storage';
import { getTemplateFilesForYear } from '@/lib/prep-standard';
import { PREP_CATEGORY_LABELS, type PrepCategory } from '@/lib/types';
import { errorResponse } from '@/lib/api';

/** zip 內路徑不允許的字元換底線(標題/檔名可能含 / \ 等) */
function safeSegment(s: string): string {
  return s.replace(/[\\/:*?"<>|]/g, '_').trim() || '_';
}

/**
 * 整包下載本週期年度的「文件範本」(zip):
 * 依週期年度解析範本清單(通用+該年,同名覆寫),打包各項目已上傳之範本檔。
 * 存取沿 assertCycleAccess(機關限本院、委員限受指派且已開放、中心全可)。
 */
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  try {
    const { cycle } = await assertCycleAccess(params.id);
    const files = await getTemplateFilesForYear(cycle.year);
    if (files.length === 0) {
      return NextResponse.json({ error: '目前尚無文件範本可下載' }, { status: 404 });
    }

    const zip = new AdmZip();
    const usedNames = new Set<string>();
    for (const f of files) {
      const cat = PREP_CATEGORY_LABELS[f.category as PrepCategory] ?? f.category;
      let entry = `${safeSegment(cat)}/${safeSegment(f.itemTitle)}/${safeSegment(f.originalName)}`;
      // 同項目同名檔防覆蓋:附流水號
      let n = 1;
      while (usedNames.has(entry)) {
        const dot = f.originalName.lastIndexOf('.');
        const base = dot > 0 ? f.originalName.slice(0, dot) : f.originalName;
        const ext = dot > 0 ? f.originalName.slice(dot) : '';
        entry = `${safeSegment(cat)}/${safeSegment(f.itemTitle)}/${safeSegment(`${base}(${++n})${ext}`)}`;
      }
      usedNames.add(entry);
      const buf = await readFileByKey(f.storageKey);
      zip.addFile(entry, buf);
    }

    const out = zip.toBuffer();
    const yearROC = cycle.year - 1911;
    const zipName = `${yearROC}年度資料準備文件範本` + '.zip';
    return new NextResponse(new Uint8Array(out), {
      status: 200,
      headers: {
        'content-type': 'application/zip',
        'content-disposition': `attachment; filename*=UTF-8''${encodeURIComponent(zipName)}`,
        'x-content-type-options': 'nosniff',
      },
    });
  } catch (e) {
    return errorResponse(e);
  }
}
