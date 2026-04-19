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
        <label htmlFor={inputId} className="text-label-lg text-on-surface-variant px-3.5">
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
            'w-full appearance-none bg-surface-container rounded-t-md px-3.5 h-12 pr-10 text-body outline-none',
            'shadow-[inset_0_-1px_0_0_var(--tw-shadow-color)] shadow-outline',
            'hover:bg-surface-container-high transition-colors duration-200 ease-standard',
            'focus:shadow-[inset_0_-2px_0_0_var(--tw-shadow-color)] focus:shadow-primary-600',
            hasError && 'shadow-[inset_0_-2px_0_0_var(--tw-shadow-color)] shadow-danger-500',
            disabled && 'opacity-50 cursor-not-allowed',
          )}
          {...rest}
        >
          {children}
        </select>
        <ChevronDown
          size={18}
          className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-on-surface-variant"
        />
      </div>
      {hasError ? (
        <p className="text-caption text-danger-700 px-3.5">{errorText}</p>
      ) : helperText ? (
        <p className="text-caption text-on-surface-variant px-3.5">{helperText}</p>
      ) : null}
    </div>
  );
});
