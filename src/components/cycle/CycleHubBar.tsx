import Link from 'next/link';
import { ChevronLeft } from '@/components/icons';

/**
 * 內頁(檢核表填報 / 資料準備 / 缺失明細)頂部的「回週期工作台」導引列。
 * 內頁原本只剩麵包屑、缺單一指引(評審指出的動線斷崖);此列明確指回工作台
 * ——主行動橫幅與各階段引導式精靈都在那——並給一句「此頁完成後的下一步」,補足動線連續性。
 */
export function CycleHubBar({
  cycleId,
  label,
  nextHint,
}: {
  cycleId: string;
  /** 例:115 年度 · 臺大醫院雲林分院 */
  label: string;
  /** 例:填報送出後,於工作台「確定繳交」並查看下一步 */
  nextHint?: string;
}) {
  return (
    <div className="mb-5 flex flex-wrap items-center gap-x-2.5 gap-y-1 rounded-lg border border-rule bg-card px-4 py-2.5">
      <Link
        href={`/cycles/${cycleId}`}
        className="inline-flex items-center gap-1 min-h-9 text-label-lg font-medium text-primary-700 hover:underline focus-ring rounded"
      >
        <ChevronLeft size={16} aria-hidden />
        回週期工作台
      </Link>
      <span className="text-caption text-ink-500">
        {label}
        {nextHint ? ` · ${nextHint}` : ''}
      </span>
    </div>
  );
}
