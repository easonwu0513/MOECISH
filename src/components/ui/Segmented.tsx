'use client';

import { useRef } from 'react';
import { cn } from '@/lib/cn';
import { TONE, type Tone } from '@/lib/tone';
import { Check } from '../icons';

/**
 * Material 3 Segmented Button (single-select form).
 * Outlined group where the selected option gets a filled-tonal surface.
 */
type SegTone = Extract<Tone, 'neutral' | 'success' | 'warning' | 'danger'>;
type Option<T extends string> = {
  value: T;
  label: string;
  tone?: SegTone;
};

type Props<T extends string> = {
  value: T | null;
  onChange: (value: T) => void;
  options: Option<T>[];
  disabled?: boolean;
  size?: 'sm' | 'md';
  className?: string;
  ariaLabel?: string;
};

// 選中態:neutral=M3 tonal container(預設選中外觀,刻意有別於 TONE.neutral.solid 深灰);
// 語意色選中一律取 lib/tone 的 solid 面向(批72 統一實心 600,消 warning/danger 500 漂移)。
const selectedStyle: Record<SegTone, string> = {
  neutral: 'bg-primary-container text-on-primary-container',
  success: TONE.success.solid,
  warning: TONE.warning.solid,
  danger:  TONE.danger.solid,
};

export function Segmented<T extends string>({
  value,
  onChange,
  options,
  disabled,
  size = 'md',
  className,
  ariaLabel,
}: Props<T>) {
  // radiogroup 鍵盤導覽:roving tabindex(整組單一 tab stop)+ 方向鍵移動並選取
  const btnRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const selectedIdx = options.findIndex((o) => o.value === value);
  const tabbableIdx = selectedIdx >= 0 ? selectedIdx : 0;

  function moveTo(i: number) {
    const n = options.length;
    if (n === 0) return;
    const next = (i + n) % n;
    btnRefs.current[next]?.focus();
    onChange(options[next].value); // selection follows focus
  }

  function onKeyDown(e: React.KeyboardEvent, idx: number) {
    if (disabled) return;
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') { e.preventDefault(); moveTo(idx + 1); }
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') { e.preventDefault(); moveTo(idx - 1); }
    else if (e.key === 'Home') { e.preventDefault(); moveTo(0); }
    else if (e.key === 'End') { e.preventDefault(); moveTo(options.length - 1); }
  }

  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      className={cn(
        'inline-flex rounded-full overflow-hidden border border-outline-variant',
        disabled && 'opacity-50',
        className,
      )}
    >
      {options.map((opt, idx) => {
        const selected = opt.value === value;
        const tone = opt.tone ?? 'neutral';
        return (
          <button
            key={opt.value}
            ref={(el) => { btnRefs.current[idx] = el; }}
            role="radio"
            aria-checked={selected}
            tabIndex={idx === tabbableIdx ? 0 : -1}
            disabled={disabled}
            onClick={() => onChange(opt.value)}
            onKeyDown={(e) => onKeyDown(e, idx)}
            className={cn(
              'flex items-center justify-center gap-1.5 font-medium transition-colors duration-150 ease-standard focus-ring',
              idx > 0 && 'border-l border-outline-variant',
              size === 'sm' ? 'h-8 px-3 text-body-sm' : 'h-10 px-4 text-label-lg',
              selected
                ? selectedStyle[tone]
                : 'bg-surface text-on-surface hover:bg-surface-container',
            )}
          >
            {selected && <Check size={14} />}
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
