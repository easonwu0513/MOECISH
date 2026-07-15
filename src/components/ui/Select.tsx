'use client';

import { forwardRef, SelectHTMLAttributes, useId } from 'react';
import { cn } from '@/lib/cn';
import { ChevronDown } from '../icons';

type Props = SelectHTMLAttributes<HTMLSelectElement> & {
  label?: string;
  helperText?: string;
  errorText?: string;
  /** 密集模式:表格內嵌用,矮身/小字/窄箭頭留白,避免文字被壓縮截斷(UAT) */
  dense?: boolean;
};

export const Select = forwardRef<HTMLSelectElement, Props>(function Select(
  { label, helperText, errorText, id, className, disabled, children, dense, ...rest },
  ref,
) {
  const genId = useId();
  const inputId = id ?? genId;
  const hasError = Boolean(errorText);
  const descId = `${inputId}-desc`;
  const describedBy = hasError || helperText ? descId : undefined;

  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      {label && (
        <label htmlFor={inputId} className="text-label-lg text-ink-500 px-3.5">
          {label}
        </label>
      )}
      <div className="relative">
        <select
          ref={ref}
          id={inputId}
          disabled={disabled}
          aria-invalid={hasError}
          aria-describedby={describedBy}
          className={cn(
            'w-full appearance-none bg-paper-sunk outline-none',
            dense ? 'rounded-md px-2 h-8 pr-7 text-caption' : 'rounded-t-md px-3.5 h-12 pr-10 text-body',
            'shadow-[inset_0_-1px_0_0_var(--tw-shadow-color)] shadow-neutral-400',
            'hover:bg-rule transition-colors duration-200 ease-standard',
            'focus:shadow-[inset_0_-2px_0_0_var(--tw-shadow-color)] focus:shadow-primary-600',
            hasError && 'shadow-[inset_0_-2px_0_0_var(--tw-shadow-color)] shadow-danger-500',
            disabled && 'opacity-50 cursor-not-allowed',
          )}
          {...rest}
        >
          {children}
        </select>
        <ChevronDown
          size={dense ? 14 : 18}
          className={cn('pointer-events-none absolute top-1/2 -translate-y-1/2 text-ink-500', dense ? 'right-2' : 'right-3.5')}
        />
      </div>
      {hasError ? (
        <p id={descId} className="text-caption text-danger-700 px-3.5">{errorText}</p>
      ) : helperText ? (
        <p id={descId} className="text-caption text-ink-500 px-3.5">{helperText}</p>
      ) : null}
    </div>
  );
});
