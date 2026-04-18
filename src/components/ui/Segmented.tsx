'use client';

import { cn } from '@/lib/cn';

type Option<T extends string> = {
  value: T;
  label: string;
  tone?: 'neutral' | 'success' | 'warning' | 'danger';
};

type Props<T extends string> = {
  value: T | null;
  onChange: (value: T) => void;
  options: Option<T>[];
  disabled?: boolean;
  size?: 'sm' | 'md';
  className?: string;
  ariaLabel?: string;
};

const toneSelectedBg: Record<NonNullable<Option<string>['tone']>, string> = {
  neutral: 'bg-primary-600 text-white',
  success: 'bg-success-500 text-white',
  warning: 'bg-warning-500 text-white',
  danger:  'bg-danger-500 text-white',
};

export function Segmented<T extends string>({
  value,
  onChange,
  options,
  disabled,
  size = 'md',
  className,
  ariaLabel,
}: Props<T>) {
  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      className={cn(
        'inline-flex rounded-lg border border-hairline bg-neutral-50 p-0.5',
        disabled && 'opacity-60',
        className,
      )}
    >
      {options.map((opt) => {
        const selected = opt.value === value;
        const tone = opt.tone ?? 'neutral';
        return (
          <button
            key={opt.value}
            role="radio"
            aria-checked={selected}
            disabled={disabled}
            onClick={() => onChange(opt.value)}
            className={cn(
              'flex-1 font-medium transition-all duration-180 ease-smooth focus-ring rounded-md',
              size === 'sm' ? 'h-7 px-3 text-[0.8125rem]' : 'h-8 px-4 text-body-sm',
              selected
                ? toneSelectedBg[tone] + ' shadow-xs'
                : 'text-neutral-600 hover:text-neutral-900 hover:bg-white/70',
            )}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
