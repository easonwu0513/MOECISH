'use client';

import { ReportContent } from '@/components/audit-merge/ReportContent';
import { sortFindings, type ReportData } from '@/components/audit-merge/lib';
import './assembled-report.css';

/**
 * 系統原生彙整報告:把 DB 的委員發現組成 ReportData,
 * 直接重用「稽核報告彙整工具」的 Word 版式渲染(當天列印給受稽單位簽名的正式格式)。
 */
export default function AssembledReport({ data }: { data: ReportData }) {
  return (
    <div className="asr-scope">
      <ReportContent
        data={data}
        sortFunc={sortFindings}
        activeFocusId={null}
        cursorPos={null}
        isPrint
      />
    </div>
  );
}
