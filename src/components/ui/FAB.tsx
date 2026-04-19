'use client';

import { forwardRef, ButtonHTMLAttributes, ReactNode } from 'react';
import { cn } from '@/lib/cn';

/**
 * Material 3 Floating Action Button (FAB).
 * Variants: primary / secondary / tertiary / surface
 * Sizes:    small (40), regular (56), large (96)
 * Extended: shows label alongside icon
 */
type Variant = 'primary' | 'secondary' | 'surface';
type Size = 'small' | 'regular' | 'large';

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  icon: ReactNode;
  label?: string;  /** if provided → extended FAB */
  variant?: Variant;
  size?: Size;
  ariaLabel?: string;
};

const variantStyles: Record<Variant, string> = {
  primary:
    'bg-primary-container text-on-primary-container shadow-elev-3 hover:shadow-elev-4 active:shadow-elev-3',
  secondary:
    'bg-sage-100 text-sage-800 shadow-elev-3 hover:shadow-elev-4 active:shadow-elev-3',
  surface:
    'bg-surface-container-high text-primary-700 shadow-elev-3 hover:shadow-elev-4 active:shadow-elev-3',
};

export const FAB = forwardRef<HTMLButtonElement, Props>(function FAB(
  { icon, label, variant = 'primary', size = 'regular', ariaLabel, className, ...rest },
  ref,
) {
  const sizeStyles =
    label
      ? 'h-14 pl-4 pr-5 gap-3 rounded-md'
      : size === 'small'
      ? 'w-10 h-10 rounded-md'
      : size === 'large'
      ? 'w-24 h-24 rounded-lg'
      : 'w-14 h-14 rounded-md';

  return (
    <button
      ref={ref}
      aria-label={ariaLabel ?? label}
      className={cn(
        'inline-flex items-center justify-center font-medium transition-all duration-200 ease-standard focus-ring',
        '[&:active:not(:disabled)]:scale-[0.96]',
        'disabled:opacity-40 disabled:cursor-not-allowed',
        variantStyles[variant],
        sizeStyles,
        className,
      )}
      {...rest}
    >
      {icon}
      {label && <span className="leading-none text-label-lg">{label}</span>}
    </button>
  );
});
