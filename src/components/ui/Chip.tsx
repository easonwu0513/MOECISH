import { HTMLAttributes, ReactNode } from 'react';
import { cn } from '@/lib/cn';
import { TONE, type Tone } from '@/lib/tone';

/**
 * Material 3 chips:
 *  - assist / suggestion → outlined
 *  - filter (selected)   → filled(實心 solid)
 *  - input (with dot)    → soft
 * 色調一律取自 lib/tone 的單一來源 TONE(批72),不再於本檔手抄對照表。
 */
type Size = 'xs' | 'sm' | 'md';
type Variant = 'soft' | 'outlined' | 'filled';

type Props = HTMLAttributes<HTMLSpanElement> & {
  tone?: Tone;
  size?: Size;
  variant?: Variant;
  dot?: boolean;
  icon?: ReactNode;
};

const sizes: Record<Size, string> = {
  xs: 'h-5 px-2   text-label-sm gap-1   rounded-full',
  sm: 'h-6 px-2.5 text-label        gap-1   rounded-full',
  md: 'h-7 px-3   text-label-lg     gap-1.5 rounded-full',
};

export function Chip({
  tone = 'neutral',
  size = 'sm',
  variant = 'soft',
  dot,
  icon,
  className,
  children,
  ...rest
}: Props) {
  const palette =
    variant === 'outlined' ? TONE[tone].outlined :
    variant === 'filled'   ? TONE[tone].solid    :
    TONE[tone].soft;

  return (
    <span
      className={cn(
        'inline-flex items-center font-medium whitespace-nowrap tabular-nums',
        palette,
        sizes[size],
        className,
      )}
      {...rest}
    >
      {dot && <span className={cn('w-1.5 h-1.5 rounded-full', TONE[tone].dot)} />}
      {icon && <span className="shrink-0">{icon}</span>}
      {children}
    </span>
  );
}
