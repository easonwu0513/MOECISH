'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui/Button';
import { useToast } from '@/components/ui/Toast';
import { AlertTriangle, Download } from '@/components/icons';

/**
 * 中心視角:本年度「需求清單範本」尚未建立時的告示（批63）。
 * 系統的資料準備範本逐年度化：新年度未建立範本時,「套用標準清單」只會套用系統內建預設清單、
 * 且沒有可提供機關整包下載的文件範本(page 端 getStandardItems/getTemplateFilesForYear 回退)。
 * 此告示把「10 項哪來的」與「文件範本不見了」的根因講清楚,並提供一鍵「從最近往年複製(含文件範本檔)」。
 * 僅 SUPER_ADMIN 渲染;複製走既有 /api/admin/prep-template/copy-to-year(自帶 requireRole)。
 */
export default function PrepYearTemplateNotice({
  cycleYearAD,
  cycleYearROC,
  priorYearROC,
  priorItemIds,
}: {
  cycleYearAD: number;
  cycleYearROC: number;
  /** 最近一個「有範本項目」的往年(民國年);無往年可複製時為 null */
  priorYearROC: number | null;
  /** 該往年的範本項目 id(供整年複製) */
  priorItemIds: string[];
}) {
  const router = useRouter();
  const toast = useToast();
  const [busy, setBusy] = useState(false);

  async function copyFromPrior() {
    if (!priorItemIds.length) return;
    setBusy(true);
    const res = await fetch('/api/admin/prep-template/copy-to-year', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ itemIds: priorItemIds, targetYear: cycleYearAD }),
    });
    setBusy(false);
    if (!res.ok) {
      const j = (await res.json().catch(() => ({}))) as { error?: string };
      toast.error('複製失敗', j.error || '請稍後再試，或至資料準備範本管理手動設定。');
      return;
    }
    const j = (await res.json()) as { copied: number; fileCopied: number; fileErrors: number };
    toast.success(
      `已從 ${priorYearROC} 年度複製到 ${cycleYearROC} 年度`,
      `${j.copied} 項需求 + ${j.fileCopied} 個文件範本已帶入${j.fileErrors ? `（${j.fileErrors} 個範本檔複製失敗）` : ''}。文件範本已可下載；如需將需求帶入本週期，請按下方「套用標準清單」。`,
    );
    router.refresh();
  }

  return (
    <div className="mb-5 rounded-lg border border-warning-200 bg-warning-50 px-4 py-3.5">
      <div className="flex items-start gap-2.5">
        <AlertTriangle size={17} className="mt-0.5 shrink-0 text-warning-700" />
        <div className="min-w-0 flex-1">
          <p className="text-body-sm font-semibold text-warning-800">
            {cycleYearROC} 年度尚未建立需求清單範本
          </p>
          <p className="mt-1 text-caption text-ink-700 leading-relaxed">
            系統的資料準備範本逐年度設定。本年度尚未建立，因此「套用標準清單」目前套用的是
            <span className="font-medium">系統內建預設清單</span>，且沒有可提供受稽機關整包下載的
            <span className="font-medium">文件範本</span>。
            {priorYearROC != null
              ? `建議從 ${priorYearROC} 年度複製（含文件範本檔），再視需要微調。`
              : '請至資料準備範本管理建立需求項與上傳文件範本。'}
          </p>
          <div className="mt-2.5 flex flex-wrap items-center gap-2">
            {priorYearROC != null && priorItemIds.length > 0 && (
              <Button
                size="sm"
                variant="filled"
                leadingIcon={<Download size={15} />}
                loading={busy}
                onClick={copyFromPrior}
              >
                從 {priorYearROC} 年度複製需求清單與文件範本（{priorItemIds.length} 項）
              </Button>
            )}
            <Link
              href="/admin/prep-template"
              className="inline-flex items-center min-h-9 px-2 text-caption text-primary-700 hover:underline focus-ring rounded"
            >
              前往資料準備範本管理自行設定 →
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
