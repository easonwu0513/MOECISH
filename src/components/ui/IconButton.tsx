'use client';

import { forwardRef, ButtonHTMLAttributes, ReactNode } from 'react';
import { cn } from '@/lib/cn';

type Variant = 'ghost' | 'subtle' | 'primary';
type Size = 'sm' | 'md' | 'lg';

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  size?: Size;
  icon: ReactNode;
  label: string; // required for a11y
};

const v: Record<Variant, string> = {
  ghost: 'bg-transparent text-neutral-600 hover:text-neutral-900 hover:bg-neutral-100',
  subtle: 'bg-neutral-100 text-neutral-700 hover:bg-neutral-200',
  primary: 'bg-primary-600 text-white hover:bg-primary-700',
};
const s: Record<Size, string> = {
  sm: 'w-8 h-8',
  md: 'w-10 h-10',
  lg: 'w-12 h-12',
};

export const IconButton = forwardRef<HTMLButtonElement, Props>(function IconButton(
  { variant = 'ghost', size = 'md', icon, label, className, ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      aria-label={label}
      title={label}
      className={cn(
        'inline-flex items-center justify-center rounded-lg transition-colors focus-ring disabled:opacity-50 disabled:cursor-not-allowed',
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
