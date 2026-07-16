import { ReactNode } from 'react';
import { cn } from '@/lib/cn';
import type { Tone } from '@/lib/tone';

/** 圖示圓底色(依語意切換;預設中性);Tone 型別取自 lib/tone 單一來源(批72,子集用 Extract) */
type ESTone = Extract<Tone, 'neutral' | 'success' | 'primary' | 'warning' | 'danger'>;
const toneRing: Record<ESTone, string> = {
  neutral: 'bg-paper-sunk text-ink-500',
  success: 'bg-success-50 text-success-600',
  primary: 'bg-primary-50 text-primary-700',
  warning: 'bg-warning-50 text-warning-700',
  danger: 'bg-danger-50 text-danger-600',
};

export function EmptyState({
  icon,
  title,
  description,
  action,
  tone = 'neutral',
  className,
}: {
  icon?: ReactNode;
  title: string;
  description?: ReactNode;
  action?: ReactNode;
  tone?: ESTone;
  className?: string;
}) {
  return (
    <div className={cn('flex flex-col items-center justify-center text-center py-12 px-6', className)}>
      {icon && (
        <div className={cn('mb-5 w-16 h-16 rounded-full flex items-center justify-center', toneRing[tone])}>
          {icon}
        </div>
      )}
      <h3 className="text-title-lg text-ink-900">{title}</h3>
      {description && (
        <p className="mt-2 text-body-sm text-ink-500 max-w-md text-balance leading-relaxed">
          {description}
        </p>
      )}
      {action && <div className="mt-6">{action}</div>}
    </div>
  );
}
