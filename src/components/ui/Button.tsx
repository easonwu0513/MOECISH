'use client';

import { forwardRef, ButtonHTMLAttributes, ReactNode } from 'react';
import { cn } from '@/lib/cn';
import { Spinner } from './Spinner';

type Variant = 'primary' | 'tonal' | 'secondary' | 'ghost' | 'danger' | 'success' | 'warning';
type Size = 'xs' | 'sm' | 'md' | 'lg';

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  leadingIcon?: ReactNode;
  trailingIcon?: ReactNode;
  fullWidth?: boolean;
};

const variantStyles: Record<Variant, string> = {
  primary:
    'bg-primary-600 text-white border border-primary-700/30 shadow-xs ' +
    'hover:bg-primary-700 hover:shadow-sm active:bg-primary-800 active:shadow-xs',
  tonal:
    'bg-primary-50 text-primary-700 border border-primary-100 ' +
    'hover:bg-primary-100 hover:border-primary-200 active:bg-primary-200/70',
  secondary:
    'bg-white text-neutral-700 border border-subtle shadow-xs ' +
    'hover:bg-neutral-25 hover:border-strong active:bg-neutral-50',
  ghost:
    'bg-transparent text-neutral-600 border border-transparent ' +
    'hover:bg-neutral-100 hover:text-neutral-900 active:bg-neutral-150',
  danger:
    'bg-danger-500 text-white border border-danger-600/40 shadow-xs ' +
    'hover:bg-danger-600 active:bg-danger-700',
  success:
    'bg-success-500 text-white border border-success-600/40 shadow-xs ' +
    'hover:bg-success-600 active:bg-success-700',
  warning:
    'bg-warning-500 text-white border border-warning-600/40 shadow-xs ' +
    'hover:bg-warning-600 active:bg-warning-700',
};

const sizeStyles: Record<Size, string> = {
  xs: 'h-7  px-2.5 text-[0.8125rem] gap-1.5 rounded-md',
  sm: 'h-8  px-3   text-body-sm      gap-1.5 rounded-md',
  md: 'h-9  px-3.5 text-body-sm      gap-2   rounded-lg',
  lg: 'h-11 px-5   text-body         gap-2   rounded-lg',
};

export const Button = forwardRef<HTMLButtonElement, Props>(function Button(
  {
    variant = 'primary',
    size = 'md',
    loading,
    leadingIcon,
    trailingIcon,
    fullWidth,
    disabled,
    children,
    className,
    ...rest
  },
  ref,
) {
  return (
    <button
      ref={ref}
      disabled={disabled || loading}
      className={cn(
        'inline-flex items-center justify-center font-medium whitespace-nowrap select-none',
        'transition-all duration-180 ease-smooth focus-ring',
        'disabled:opacity-50 disabled:cursor-not-allowed disabled:shadow-none',
        '[&:active:not(:disabled)]:scale-[0.98]',
        variantStyles[variant],
        sizeStyles[size],
        fullWidth && 'w-full',
        className,
      )}
      {...rest}
    >
      {loading ? (
        <Spinner size={size === 'xs' || size === 'sm' ? 14 : 16} />
      ) : (
        leadingIcon
      )}
      {children && <span className="leading-none">{children}</span>}
      {!loading && trailingIcon}
    </button>
  );
});
