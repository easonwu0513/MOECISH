import { HTMLAttributes, ReactNode } from 'react';
import { cn } from '@/lib/cn';

/**
 * Material 3 chips:
 *  - assist / suggestion → outlined
 *  - filter (selected)   → filled (primary-container)
 *  - input (with dot)    → soft
 */
type Tone = 'neutral' | 'primary' | 'sage' | 'success' | 'warning' | 'danger';
type Size = 'xs' | 'sm' | 'md';
type Variant = 'soft' | 'outlined' | 'filled';

type Props = HTMLAttributes<HTMLSpanElement> & {
  tone?: Tone;
  size?: Size;
  variant?: Variant;
  dot?: boolean;
  icon?: ReactNode;
};

const softTones: Record<Tone, string> = {
  neutral: 'bg-surface-container-high text-on-surface',
  primary: 'bg-primary-50 text-primary-800 ring-1 ring-inset ring-primary-200',
  sage:    'bg-sage-50    text-sage-800    ring-1 ring-inset ring-sage-200',
  success: 'bg-success-50 text-success-700 ring-1 ring-inset ring-success-200',
  warning: 'bg-warning-50 text-warning-700 ring-1 ring-inset ring-warning-200',
  danger:  'bg-danger-50  text-danger-700  ring-1 ring-inset ring-danger-200',
};

const outlinedTones: Record<Tone, string> = {
  neutral: 'bg-transparent text-on-surface-variant border border-outline-variant',
  primary: 'bg-transparent text-primary-700 border border-primary-300',
  sage:    'bg-transparent text-sage-700    border border-sage-300',
  success: 'bg-transparent text-success-700 border border-success-300',
  warning: 'bg-transparent text-warning-700 border border-warning-300',
  danger:  'bg-transparent text-danger-700  border border-danger-300',
};

const filledTones: Record<Tone, string> = {
  neutral: 'bg-neutral-800 text-white',
  primary: 'bg-primary-container text-on-primary-container',
  sage:    'bg-sage-100 text-sage-800',
  success: 'bg-success-600 text-white',
  warning: 'bg-warning-500 text-white',
  danger:  'bg-danger-600 text-white',
};

const dotColor: Record<Tone, string> = {
  neutral: 'bg-neutral-500',
  primary: 'bg-primary-500',
  sage:    'bg-sage-500',
  success: 'bg-success-500',
  warning: 'bg-warning-500',
  danger:  'bg-danger-500',
};

const sizes: Record<Size, string> = {
  xs: 'h-5 px-2   text-[0.6875rem] gap-1   rounded-full',
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
    variant === 'outlined' ? outlinedTones[tone] :
    variant === 'filled'   ? filledTones[tone]   :
    softTones[tone];

  return (
    <span
      className={cn(
        'inline-flex items-center font-medium whitespace-nowrap',
        palette,
        sizes[size],
        className,
      )}
      {...rest}
    >
      {dot && <span className={cn('w-1.5 h-1.5 rounded-full', dotColor[tone])} />}
      {icon && <span className="shrink-0">{icon}</span>}
      {children}
    </span>
  );
}
