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
  const descId = `${inputId}-desc`;
  const describedBy = hasError || helperText ? descId : undefined;
  const [focused, setFocused] = useState(false);
  const filled = Boolean(value ?? defaultValue);
  // textarea 的 placeholder 可見,若標籤停在中間會與其重疊;有 placeholder 時一律上浮
  const hasPlaceholder = Boolean(rest.placeholder);
  const raised = focused || filled || hasPlaceholder;

  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <div
        className={cn(
          'group relative rounded-t-md overflow-hidden transition-all duration-200 ease-standard',
          'bg-paper-sunk',
          hasError
            ? 'shadow-[inset_0_-2px_0_0_var(--tw-shadow-color)] shadow-danger-500'
            : focused
            ? 'shadow-[inset_0_-2px_0_0_var(--tw-shadow-color)] shadow-primary-600'
            : 'shadow-[inset_0_-1px_0_0_var(--tw-shadow-color)] shadow-neutral-400',
          !focused && !hasError && 'hover:bg-rule',
          disabled && 'opacity-50',
        )}
      >
        {/* 標籤帶遮罩:textarea 內容捲動時會捲進頂部 padding 區、透到浮動標籤後方造成重疊;
            以與欄位同底色的遮罩(高度=pt-6)蓋住該帶,讓捲上來的文字被遮住、標籤恆清晰。 */}
        {label && (
          <div
            aria-hidden
            className={cn(
              'absolute top-0 left-0 right-0 h-6 z-10 pointer-events-none rounded-t-md bg-paper-sunk',
              !focused && !hasError && 'group-hover:bg-rule',
            )}
          />
        )}
        {label && (
          <label
            htmlFor={inputId}
            className={cn(
              'absolute z-20 pointer-events-none transition-all duration-200 ease-standard left-3.5',
              raised
                ? 'top-2 text-caption'
                : 'top-3 text-body',
              hasError ? 'text-danger-700' : raised && focused ? 'text-primary-700' : 'text-ink-500',
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
          aria-describedby={describedBy}
          value={value}
          defaultValue={defaultValue}
          onFocus={(e) => { setFocused(true); onFocus?.(e); }}
          onBlur={(e) => { setFocused(false); onBlur?.(e); }}
          className={cn(
            'block w-full bg-transparent px-3.5 py-3 pt-6 text-body outline-none resize-y leading-relaxed',
            'placeholder:text-ink-500 disabled:cursor-not-allowed',
            !label && 'pt-3',
          )}
          {...rest}
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
