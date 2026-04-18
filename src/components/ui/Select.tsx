'use client';

import { forwardRef, SelectHTMLAttributes, useId } from 'react';
import { cn } from '@/lib/cn';
import { ChevronDown } from '../icons';

type Props = SelectHTMLAttributes<HTMLSelectElement> & {
  label?: string;
  helperText?: string;
  errorText?: string;
};

export const Select = forwardRef<HTMLSelectElement, Props>(function Select(
  { label, helperText, errorText, id, className, disabled, children, ...rest },
  ref,
) {
  const genId = useId();
  const inputId = id ?? genId;
  const hasError = Boolean(errorText);

  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      {label && (
        <label htmlFor={inputId} className="text-label text-neutral-700">
          {label}
        </label>
      )}
      <div className="relative">
        <select
          ref={ref}
          id={inputId}
          disabled={disabled}
          aria-invalid={hasError}
          className={cn(
            'w-full appearance-none bg-white rounded-md border px-3 py-2 pr-9 text-body outline-none transition-colors',
            'focus:border-primary-500 focus:shadow-focus',
            hasError
              ? 'border-danger-500'
              : 'border-neutral-300 hover:border-neutral-400',
            disabled && 'bg-neutral-50 opacity-70 cursor-not-allowed',
          )}
          {...rest}
        >
          {children}
        </select>
        <ChevronDown
          size={16}
          className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-neutral-400"
        />
      </div>
      {hasError ? (
        <p className="text-caption text-danger-700">{errorText}</p>
      ) : helperText ? (
        <p className="text-caption text-neutral-500">{helperText}</p>
      ) : null}
    </div>
  );
});
