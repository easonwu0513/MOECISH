'use client';

import { forwardRef, InputHTMLAttributes, ReactNode, useId } from 'react';
import { cn } from '@/lib/cn';

type Props = InputHTMLAttributes<HTMLInputElement> & {
  label?: string;
  helperText?: string;
  errorText?: string;
  leadingIcon?: ReactNode;
  trailingIcon?: ReactNode;
};

export const TextField = forwardRef<HTMLInputElement, Props>(function TextField(
  { label, helperText, errorText, leadingIcon, trailingIcon, id, className, disabled, ...rest },
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
      <div
        className={cn(
          'relative flex items-center rounded-lg border bg-white transition-all duration-180 ease-smooth',
          'focus-within:border-primary-500 focus-within:shadow-focus',
          hasError
            ? 'border-danger-500 shadow-focus-danger'
            : 'border-subtle hover:border-strong',
          disabled && 'bg-neutral-50 opacity-70',
        )}
      >
        {leadingIcon && (
          <span className="pl-3 text-neutral-400 shrink-0 flex items-center">{leadingIcon}</span>
        )}
        <input
          ref={ref}
          id={inputId}
          disabled={disabled}
          aria-invalid={hasError}
          aria-describedby={hasError ? `${inputId}-err` : helperText ? `${inputId}-help` : undefined}
          className={cn(
            'flex-1 min-w-0 bg-transparent px-3 h-10 text-body outline-none',
            'placeholder:text-neutral-400 disabled:cursor-not-allowed',
            leadingIcon && 'pl-2',
            trailingIcon && 'pr-2',
          )}
          {...rest}
        />
        {trailingIcon && (
          <span className="pr-3 text-neutral-400 shrink-0 flex items-center">{trailingIcon}</span>
        )}
      </div>
      {hasError ? (
        <p id={`${inputId}-err`} className="text-caption text-danger-700">{errorText}</p>
      ) : helperText ? (
        <p id={`${inputId}-help`} className="text-caption text-neutral-500">{helperText}</p>
      ) : null}
    </div>
  );
});
