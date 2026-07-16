import type { NextAction } from '@/lib/process-guide';
import { PrimaryActionCta } from './PrimaryActionCta';

/**
 * 「建議的下一步」主行動橫幅。
 * 輕盈版(減法):淺藍底白卡 + 深色動作大字 + 單一 primary 按鈕,以「唯一填色 CTA + 眉標 + 位置」鎖定焦點,
 * 不用整塊飽和深藍(避免色調過重),保留舒適呼吸感。直取 process-guide 的 nextActionForRole 輸出。
 */
export function PrimaryActionBanner({
  next,
  eyebrow = '建議的下一步',
  subtext,
  doneText = '目前沒有待辦事項，一切都在進度上。',
  overdue = false,
  className = '',
}: {
  next: NextAction;
  eyebrow?: string;
  subtext?: string;
  doneText?: string;
  /** 逾期(批57):整卡染紅示警(機關矯正逾期);非逾期維持輕盈淺藍。CTA/標題保留。 */
  overdue?: boolean;
  className?: string;
}) {
  if (!next) {
    return (
      <section
        className={`rounded-lg border border-rule bg-card px-5 py-4 text-body-sm text-ink-500 ${className}`}
      >
        {doneText}
      </section>
    );
  }
  const hasCta = !!(next.href && next.cta);
  const shell = overdue ? 'border-danger-200 bg-danger-50' : 'border-primary-100 bg-primary-50/70';
  const eyebrowColor = overdue ? 'text-danger-700' : 'text-primary-700';
  return (
    <section className={`rounded-lg border ${shell} px-5 py-4 sm:px-6 sm:py-5 ${className}`}>
      <p className={`text-label-sm font-medium uppercase tracking-[0.08em] ${eyebrowColor} mb-1.5`}>{overdue ? '逾期・請儘速處理' : eyebrow}</p>
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="min-w-0 flex-1">
          <h2 className="text-title-lg text-ink-900 leading-snug">{next.text}</h2>
          {subtext && <p className="mt-1 text-body-sm text-ink-500 leading-relaxed">{subtext}</p>}
        </div>
        {hasCta && (
          <PrimaryActionCta
            href={next.href!}
            label={next.cta!}
            className="shrink-0 inline-flex items-center gap-1.5 rounded-full bg-primary-600 px-5 min-h-11 text-label-lg font-medium text-white hover:bg-primary-700 transition-colors focus-ring"
          />
        )}
      </div>
    </section>
  );
}
