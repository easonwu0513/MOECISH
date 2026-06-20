import { ReactNode } from 'react';
import { cn } from '@/lib/cn';

type Tone = 'neutral' | 'success' | 'primary' | 'warning' | 'danger';

/** 圖示圓底色(依語意切換;預設中性) */
const toneRing: Record<Tone, string> = {
  neutral: 'bg-surface-container-high text-on-surface-variant',
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
  tone?: Tone;
  className?: string;
}) {
  return (
    <div className={cn('flex flex-col items-center justify-center text-center py-12 px-6', className)}>
      {icon && (
        <div className={cn('mb-5 w-16 h-16 rounded-full flex items-center justify-center', toneRing[tone])}>
          {icon}
        </div>
      )}
      <h3 className="text-title-lg text-on-surface">{title}</h3>
      {description && (
        <p className="mt-2 text-body-sm text-on-surface-variant max-w-md text-balance leading-relaxed">
          {description}
        </p>
      )}
      {action && <div className="mt-6">{action}</div>}
    </div>
  );
}
