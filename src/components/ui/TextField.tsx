'use client';

import { forwardRef, InputHTMLAttributes, ReactNode, useId, useState } from 'react';
import { cn } from '@/lib/cn';

/**
 * Material 3 filled TextField with floating label.
 * - Base state: bg-surface-container, underline 1px
 * - Focus:      underline 2px primary, label floats
 * - Error:      underline danger
 */
type Props = InputHTMLAttributes<HTMLInputElement> & {
  label?: string;
  helperText?: string;
  errorText?: string;
  leadingIcon?: ReactNode;
  trailingIcon?: ReactNode;
  /** M3 outlined variant */
  variant?: 'filled' | 'outlined';
};

export const TextField = forwardRef<HTMLInputElement, Props>(function TextField(
  {
    label,
    helperText,
    errorText,
    leadingIcon,
    trailingIcon,
    id,
    className,
    disabled,
    variant = 'filled',
    value,
    defaultValue,
    onFocus,
    onBlur,
    ...rest
  },
  ref,
) {
  const genId = useId();
  const inputId = id ?? genId;
  const hasError = Boolean(errorText);
  const [focused, setFocused] = useState(false);
  const filled = Boolean(value ?? defaultValue);
  const raised = focused || filled;

  if (variant === 'outlined') {
    return (
      <div className={cn('flex flex-col gap-1.5', className)}>
        <div
          className={cn(
            'relative flex items-center rounded-sm bg-surface transition-all duration-200 ease-standard',
            'border',
            hasError
              ? 'border-danger-500 shadow-focus-danger'
              : focused
              ? 'border-primary-600 border-2 shadow-focus'
              : 'border-outline-variant hover:border-outline',
            disabled && 'opacity-50',
          )}
        >
          {leadingIcon && (
            <span className="pl-3.5 text-on-surface-variant shrink-0 flex items-center">{leadingIcon}</span>
          )}
          {label && (
            <label
              htmlFor={inputId}
              className={cn(
                'absolute pointer-events-none transition-all duration-200 ease-standard bg-surface px-1',
                raised
                  ? 'top-0 -translate-y-1/2 text-[0.75rem]'
                  : 'top-1/2 -translate-y-1/2 text-body',
                raised && (hasError ? 'text-danger-700' : focused ? 'text-primary-700' : 'text-on-surface-variant'),
                !raised && 'text-on-surface-variant',
                leadingIcon ? 'left-10' : 'left-3',
              )}
            >
              {label}
            </label>
          )}
          <input
            ref={ref}
            id={inputId}
            disabled={disabled}
            aria-invalid={hasError}
            value={value}
            defaultValue={defaultValue}
            onFocus={(e) => { setFocused(true); onFocus?.(e); }}
            onBlur={(e) => { setFocused(false); onBlur?.(e); }}
            className={cn(
              'flex-1 min-w-0 bg-transparent px-3.5 h-14 text-body outline-none',
              'placeholder:text-transparent disabled:cursor-not-allowed',
              leadingIcon && 'pl-2',
              trailingIcon && 'pr-2',
            )}
            {...rest}
          />
          {trailingIcon && (
            <span className="pr-3.5 text-on-surface-variant shrink-0 flex items-center">{trailingIcon}</span>
          )}
        </div>
        {hasError ? (
          <p className="text-caption text-danger-700 px-3.5">{errorText}</p>
        ) : helperText ? (
          <p className="text-caption text-on-surface-variant px-3.5">{helperText}</p>
        ) : null}
      </div>
    );
  }

  // Filled variant (default)
  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <div
        className={cn(
          'relative flex items-center rounded-t-md overflow-hidden transition-all duration-200 ease-standard',
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
        {leadingIcon && (
          <span className="pl-3.5 text-on-surface-variant shrink-0 flex items-center">{leadingIcon}</span>
        )}
        {label && (
          <label
            htmlFor={inputId}
            className={cn(
              'absolute pointer-events-none transition-all duration-200 ease-standard',
              raised
                ? 'top-2 text-[0.75rem]'
                : 'top-1/2 -translate-y-1/2 text-body',
              hasError ? 'text-danger-700' : raised && focused ? 'text-primary-700' : 'text-on-surface-variant',
              leadingIcon ? 'left-10' : 'left-3.5',
            )}
          >
            {label}
          </label>
        )}
        <input
          ref={ref}
          id={inputId}
          disabled={disabled}
          aria-invalid={hasError}
          value={value}
          defaultValue={defaultValue}
          onFocus={(e) => { setFocused(true); onFocus?.(e); }}
          onBlur={(e) => { setFocused(false); onBlur?.(e); }}
          className={cn(
            'flex-1 min-w-0 bg-transparent px-3.5 h-14 pt-4 text-body outline-none',
            'placeholder:text-transparent disabled:cursor-not-allowed',
            !label && 'pt-0',
            leadingIcon && 'pl-2',
            trailingIcon && 'pr-2',
          )}
          {...rest}
        />
        {trailingIcon && (
          <span className="pr-3.5 text-on-surface-variant shrink-0 flex items-center">{trailingIcon}</span>
        )}
      </div>
      {hasError ? (
        <p className="text-caption text-danger-700 px-3.5">{errorText}</p>
      ) : helperText ? (
        <p className="text-caption text-on-surface-variant px-3.5">{helperText}</p>
      ) : null}
    </div>
  );
});
