'use client';

import { forwardRef, TextareaHTMLAttributes, useId } from 'react';
import { cn } from '@/lib/cn';

type Props = TextareaHTMLAttributes<HTMLTextAreaElement> & {
  label?: string;
  helperText?: string;
  errorText?: string;
};

export const Textarea = forwardRef<HTMLTextAreaElement, Props>(function Textarea(
  { label, helperText, errorText, id, className, disabled, rows = 4, ...rest },
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
      <textarea
        ref={ref}
        id={inputId}
        rows={rows}
        disabled={disabled}
        aria-invalid={hasError}
        aria-describedby={hasError ? `${inputId}-err` : helperText ? `${inputId}-help` : undefined}
        className={cn(
          'rounded-lg border bg-white px-3 py-2.5 text-body outline-none transition-all duration-180 ease-smooth resize-y',
          'placeholder:text-neutral-400 focus:border-primary-500 focus:shadow-focus leading-relaxed',
          hasError
            ? 'border-danger-500 shadow-focus-danger'
            : 'border-subtle hover:border-strong',
          disabled && 'bg-neutral-50 opacity-70 cursor-not-allowed',
        )}
        {...rest}
      />
      {hasError ? (
        <p id={`${inputId}-err`} className="text-caption text-danger-700">{errorText}</p>
      ) : helperText ? (
        <p id={`${inputId}-help`} className="text-caption text-neutral-500">{helperText}</p>
      ) : null}
    </div>
  );
});
