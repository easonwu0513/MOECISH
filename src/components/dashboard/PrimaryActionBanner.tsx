import Link from 'next/link';
import { ChevronRight } from '../icons';
import type { NextAction } from '@/lib/process-guide';

/**
 * 「建議的下一步」主行動橫幅。
 * 輕盈版(減法):淺藍底白卡 + 深色動作大字 + 單一 primary 按鈕,以「唯一填色 CTA + 眉標 + 位置」鎖定焦點,
 * 不用整塊飽和深藍(避免色調過重),保留舒適呼吸感。直取 process-guide 的 nextActionForRole 輸出。
 */
export function PrimaryActionBanner({
  next,
  eyebrow = '建議的下一步',
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
        className={`rounded-lg border border-outline-variant/60 bg-surface-container-lowest px-5 py-4 text-body-sm text-on-surface-variant ${className}`}
      >
        {doneText}
      </section>
    );
  }
  const hasCta = !!(next.href && next.cta);
  return (
    <section className={`rounded-lg border border-primary-100 bg-primary-50/70 px-5 py-4 sm:px-6 sm:py-5 ${className}`}>
      <p className="text-label-sm font-medium uppercase tracking-[0.08em] text-primary-700 mb-1.5">{eyebrow}</p>
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="min-w-0 flex-1">
          <h2 className="text-title-lg text-on-surface leading-snug">{next.text}</h2>
          {subtext && <p className="mt-1 text-body-sm text-on-surface-variant leading-relaxed">{subtext}</p>}
        </div>
        {hasCta && (
          <Link
            href={next.href!}
            className="shrink-0 inline-flex items-center gap-1.5 rounded-full bg-primary-600 px-5 min-h-11 text-label-lg font-medium text-white hover:bg-primary-700 transition-colors focus-ring"
          >
            {next.cta}
            <ChevronRight size={18} />
          </Link>
        )}
      </div>
    </section>
  );
}
