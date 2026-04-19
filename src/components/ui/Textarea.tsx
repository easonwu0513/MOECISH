'use client';

import { forwardRef, TextareaHTMLAttributes, useId, useState } from 'react';
import { cn } from '@/lib/cn';

type Props = TextareaHTMLAttributes<HTMLTextAreaElement> & {
  label?: string;
  helperText?: string;
  errorText?: string;
};

export const Textarea = forwardRef<HTMLTextAreaElement, Props>(function Textarea(
  { label, helperText, errorText, id, className, disabled, rows = 4, value, defaultValue, onFocus, onBlur, ...rest },
  ref,
) {
  const genId = useId();
  const inputId = id ?? genId;
  const hasError = Boolean(errorText);
  const [focused, setFocused] = useState(false);
  const filled = Boolean(value ?? defaultValue);
  const raised = focused || filled;

  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <div
        className={cn(
          'relative rounded-t-md overflow-hidden transition-all duration-200 ease-standard',
          'bg-surface-container',
          hasError
            ? 'shadow-[inset_0_-2px_0_0_var(--tw-shadow-color)] shadow-danger-500'
            : focused
            ? 'shadow-[inset_0_-2px_0_0_var(--tw-shadow-color)] shadow-primary-600'
            : 'shadow-[inset_0_-1px_0_0_var(--tw-shadow-color)] shadow-outline',
          !focused && !hasError && 'hover:bg-surface-container-high',
          disabled && 'opacity-50',
        )}
      >
        {label && (
          <label
            htmlFor={inputId}
            className={cn(
              'absolute pointer-events-none transition-all duration-200 ease-standard left-3.5',
              raised
                ? 'top-2 text-[0.75rem]'
                : 'top-3 text-body',
              hasError ? 'text-danger-700' : raised && focused ? 'text-primary-700' : 'text-on-surface-variant',
            )}
          >
            {label}
          </label>
        )}
        <textarea
          ref={ref}
          id={inputId}
          rows={rows}
          disabled={disabled}
          aria-invalid={hasError}
          value={value}
          defaultValue={defaultValue}
          onFocus={(e) => { setFocused(true); onFocus?.(e); }}
          onBlur={(e) => { setFocused(false); onBlur?.(e); }}
          className={cn(
            'block w-full bg-transparent px-3.5 py-3 pt-6 text-body outline-none resize-y leading-relaxed',
            'placeholder:text-on-surface-variant disabled:cursor-not-allowed',
            !label && 'pt-3',
          )}
          {...rest}
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
