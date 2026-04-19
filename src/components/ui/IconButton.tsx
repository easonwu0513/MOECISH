'use client';

import { forwardRef, ButtonHTMLAttributes, ReactNode } from 'react';
import { cn } from '@/lib/cn';

/**
 * Material 3 IconButton — always 40x40 default, fully circular, with state layer.
 */
type Variant = 'standard' | 'filled' | 'tonal' | 'outlined' | 'ghost' | 'subtle' | 'primary';
type Size = 'sm' | 'md' | 'lg';

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  size?: Size;
  icon: ReactNode;
  label: string;
};

const v: Record<Variant, string> = {
  standard:
    'bg-transparent text-on-surface-variant hover:bg-surface-container hover:text-on-surface active:bg-surface-container-high',
  ghost: /* alias → standard */
    'bg-transparent text-on-surface-variant hover:bg-surface-container hover:text-on-surface active:bg-surface-container-high',
  subtle:
    'bg-surface-container text-on-surface hover:bg-surface-container-high active:bg-surface-container-highest',
  filled:
    'bg-primary-600 text-white shadow-elev-1 hover:bg-primary-700 hover:shadow-elev-2 active:bg-primary-800',
  primary: /* alias */
    'bg-primary-600 text-white shadow-elev-1 hover:bg-primary-700 hover:shadow-elev-2 active:bg-primary-800',
  tonal:
    'bg-primary-container text-on-primary-container hover:bg-primary-200 active:bg-primary-300',
  outlined:
    'bg-transparent text-on-surface-variant border border-outline-variant hover:bg-surface-container hover:border-outline',
};

const s: Record<Size, string> = {
  sm: 'w-8 h-8',
  md: 'w-10 h-10',
  lg: 'w-12 h-12',
};

export const IconButton = forwardRef<HTMLButtonElement, Props>(function IconButton(
  { variant = 'standard', size = 'md', icon, label, className, ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      aria-label={label}
      title={label}
      className={cn(
        'inline-flex items-center justify-center rounded-full transition-all duration-200 ease-standard focus-ring',
        'disabled:opacity-40 disabled:cursor-not-allowed disabled:shadow-none',
        '[&:active:not(:disabled)]:scale-[0.96]',
        v[variant],
        s[size],
        className,
      )}
      {...rest}
    >
      {icon}
    </button>
  );
});
