import { HTMLAttributes, ReactNode } from 'react';
import { cn } from '@/lib/cn';

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
  neutral: 'bg-neutral-100 text-neutral-700 ring-1 ring-inset ring-neutral-200',
  primary: 'bg-primary-50  text-primary-700 ring-1 ring-inset ring-primary-100',
  sage:    'bg-sage-50     text-sage-700    ring-1 ring-inset ring-sage-100',
  success: 'bg-success-50  text-success-700 ring-1 ring-inset ring-success-100',
  warning: 'bg-warning-50  text-warning-700 ring-1 ring-inset ring-warning-100',
  danger:  'bg-danger-50   text-danger-700  ring-1 ring-inset ring-danger-100',
};

const outlinedTones: Record<Tone, string> = {
  neutral: 'bg-white text-neutral-700 ring-1 ring-inset ring-neutral-300',
  primary: 'bg-white text-primary-700 ring-1 ring-inset ring-primary-300',
  sage:    'bg-white text-sage-700    ring-1 ring-inset ring-sage-300',
  success: 'bg-white text-success-700 ring-1 ring-inset ring-success-500/40',
  warning: 'bg-white text-warning-700 ring-1 ring-inset ring-warning-500/40',
  danger:  'bg-white text-danger-700  ring-1 ring-inset ring-danger-500/40',
};

const filledTones: Record<Tone, string> = {
  neutral: 'bg-neutral-900 text-white',
  primary: 'bg-primary-600 text-white',
  sage:    'bg-sage-600 text-white',
  success: 'bg-success-600 text-white',
  warning: 'bg-warning-600 text-white',
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
  xs: 'h-5 px-1.5 text-[0.6875rem] gap-1 rounded-md',
  sm: 'h-5 px-2   text-caption     gap-1 rounded-full',
  md: 'h-6 px-2.5 text-label       gap-1.5 rounded-full',
};

export function Chip({
  tone = 'neutral',
  size = 'md',
  variant = 'soft',
  dot,
  icon,
  className,
  children,
  ...rest
}: Props) {
  const palette =
    variant === 'outlined' ? outlinedTones[tone] :
    variant === 'filled' ? filledTones[tone] :
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
