import { forwardRef, HTMLAttributes } from 'react';
import { cn } from '@/lib/cn';

type Props = HTMLAttributes<HTMLDivElement> & {
  elevation?: 0 | 1 | 2 | 3;
  interactive?: boolean;
  padded?: boolean;
  surface?: 'default' | 'muted' | 'raised';
};

const elevationMap = {
  0: 'shadow-none',
  1: 'shadow-xs',
  2: 'shadow-sm',
  3: 'shadow-md',
};

export const Card = forwardRef<HTMLDivElement, Props>(function Card(
  { elevation = 0, interactive, padded = true, surface = 'default', className, children, ...rest },
  ref,
) {
  return (
    <div
      ref={ref}
      className={cn(
        'border border-hairline rounded-xl transition-all duration-180 ease-smooth',
        surface === 'muted' ? 'bg-surface-muted' :
        surface === 'raised' ? 'bg-surface-raised' : 'bg-surface',
        elevationMap[elevation],
        interactive && 'hover:border-subtle hover:shadow-sm cursor-pointer',
        padded && 'p-6',
        className,
      )}
      {...rest}
    >
      {children}
    </div>
  );
});

export function CardHeader({ className, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('mb-4 flex items-start justify-between gap-4', className)} {...rest} />;
}

export function CardTitle({ className, ...rest }: HTMLAttributes<HTMLHeadingElement>) {
  return <h3 className={cn('text-title text-neutral-900', className)} {...rest} />;
}

export function CardDescription({ className, ...rest }: HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cn('text-body-sm text-neutral-500 mt-1 leading-relaxed', className)} {...rest} />;
}
