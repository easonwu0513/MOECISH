import Link from 'next/link';
import { ChevronRight } from '../icons';
import type { NextAction } from '@/lib/process-guide';

/**
 * 「你現在唯一該做的事」主行動橫幅(③ 政府級莊重設計系統的招牌元件)。
 * 全頁唯一飽和深藍區塊,直取 process-guide 的 nextActionForRole 輸出 → 三秒鎖定下一步。
 * 文案語氣可帶第二人稱暖句(subtext)。無下一步(已結案)時退為中性卡。
 */
export function PrimaryActionBanner({
  next,
  eyebrow = '你現在唯一該做的事',
  subtext,
  doneText = '本週期已結案,全部流程完成。',
  className = '',
}: {
  next: NextAction;
  eyebrow?: string;
  subtext?: string;
  doneText?: string;
  className?: string;
}) {
  if (!next) {
    return (
      <section
        className={`rounded-lg border border-outline-variant/60 bg-surface-container-low px-5 py-4 text-body-sm text-on-surface-variant ${className}`}
      >
        {doneText}
      </section>
    );
  }
  const hasCta = !!(next.href && next.cta);
  return (
    <section className={`rounded-lg bg-primary-700 px-5 py-4 sm:px-6 sm:py-5 ${className}`}>
      <p className="text-label-sm font-medium uppercase tracking-[0.08em] text-white/80 mb-2">{eyebrow}</p>
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="min-w-0 flex-1">
          <h2 className="text-title-lg text-white leading-snug">{next.text}</h2>
          {subtext && <p className="mt-1.5 text-body-sm text-white/80 leading-relaxed">{subtext}</p>}
        </div>
        {hasCta && (
          <Link
            href={next.href!}
            className="shrink-0 inline-flex items-center gap-1.5 rounded-full bg-white px-5 min-h-11 text-label-lg font-medium text-primary-800 hover:bg-primary-50 transition-colors focus-ring"
          >
            {next.cta}
            <ChevronRight size={18} />
          </Link>
        )}
      </div>
    </section>
  );
}
