'use client';

import { forwardRef, ButtonHTMLAttributes, ReactNode } from 'react';
import { cn } from '@/lib/cn';
import { Spinner } from './Spinner';

/**
 * Material 3 Button variants(統一詞彙,2026-06 移除 primary/secondary 純重複別名)。
 *  - filled  : 主要動作,bg-primary + shadow,膠囊狀
 *  - tonal   : filled-tonal,bg primary-container
 *  - outlined: 外框、透明背景(次要動作)
 *  - text    : 純文字、primary 色(低強調)
 *  - ghost   : 純文字、中性色(最低強調,如「取消」)— 與 text 的差別在色調
 *  - elevated: surface-container-low + shadow(少用)
 *  - danger/success/warning : 同 filled 視覺,語意色
 */
type Variant =
  | 'filled'
  | 'tonal'
  | 'outlined'
  | 'text'
  | 'ghost'
  | 'elevated'
  | 'danger'
  | 'success'
  | 'warning';

type Size = 'xs' | 'sm' | 'md' | 'lg';

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  leadingIcon?: ReactNode;
  trailingIcon?: ReactNode;
  fullWidth?: boolean;
  /** 提供時渲染為 <a>(取代 <a><Button> 巢狀互動元素);可搭配 download/target/rel */
  href?: string;
  target?: string;
  rel?: string;
  download?: boolean | string;
};

const variantStyles: Record<Variant, string> = {
  filled:
    'bg-primary-600 text-white shadow-elev-1 ' +
    'hover:bg-primary-700 hover:shadow-elev-2 ' +
    'active:bg-primary-800 active:shadow-elev-1',
  tonal:
    'bg-primary-container text-on-primary-container ' +
    'hover:bg-primary-200 active:bg-primary-300',
  outlined:
    'bg-transparent text-primary-700 border border-outline-variant ' +
    'hover:bg-primary-50/60 hover:border-outline active:bg-primary-100',
  text:
    'bg-transparent text-primary-700 ' +
    'hover:bg-primary-50/80 active:bg-primary-100',
  ghost:
    'bg-transparent text-on-surface-variant ' +
    'hover:bg-surface-container active:bg-surface-container-high',
  elevated:
    'bg-surface-container-low text-primary-700 shadow-elev-1 ' +
    'hover:bg-surface-container hover:shadow-elev-2 active:shadow-elev-1',
  danger:
    'bg-danger-500 text-white shadow-elev-1 ' +
    'hover:bg-danger-600 hover:shadow-elev-2 active:bg-danger-700',
  success:
    'bg-success-500 text-white shadow-elev-1 ' +
    'hover:bg-success-600 hover:shadow-elev-2 active:bg-success-700',
  warning:
    'bg-warning-500 text-white shadow-elev-1 ' +
    'hover:bg-warning-600 hover:shadow-elev-2 active:bg-warning-700',
};

const sizeStyles: Record<Size, string> = {
  xs: 'h-7  px-3   text-label-lg   gap-1.5 rounded-full',
  sm: 'h-8  px-3.5 text-label-lg   gap-1.5 rounded-full',
  md: 'h-10 px-5   text-label-lg   gap-2   rounded-full',
  lg: 'h-12 px-6   text-body       gap-2   rounded-full',
};

export const Button = forwardRef<HTMLButtonElement, Props>(function Button(
  {
    variant = 'filled',
    size = 'md',
    loading,
    leadingIcon,
    trailingIcon,
    fullWidth,
    disabled,
    children,
    className,
    href,
    target,
    rel,
    download,
    ...rest
  },
  ref,
) {
  const classes = cn(
    'relative inline-flex items-center justify-center font-medium whitespace-nowrap select-none',
    'transition-all duration-200 ease-standard focus-ring',
    'disabled:opacity-40 disabled:cursor-not-allowed disabled:shadow-none',
    '[&:active:not(:disabled)]:scale-[0.985]',
    variantStyles[variant],
    sizeStyles[size],
    fullWidth && 'w-full',
    className,
  );

  const inner = (
    <>
      {loading ? <Spinner size={size === 'xs' || size === 'sm' ? 14 : 18} /> : leadingIcon}
      {children && <span className="leading-none">{children}</span>}
      {!loading && trailingIcon}
    </>
  );

  // href → 以 <a> 渲染(單一可聚焦元素,避免 <a><button> 巢狀)
  if (href && !disabled) {
    return (
      <a
        href={href}
        target={target}
        rel={rel ?? (target === '_blank' ? 'noopener noreferrer' : undefined)}
        download={download}
        className={classes}
      >
        {inner}
      </a>
    );
  }

  return (
    <button
      ref={ref}
      disabled={disabled || loading}
      className={classes}
      {...rest}
    >
      {inner}
    </button>
  );
});
