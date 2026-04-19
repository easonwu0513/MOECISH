import { forwardRef, HTMLAttributes } from 'react';
import { cn } from '@/lib/cn';

/**
 * Material 3 Card variants:
 *  - elevated (default): bg-surface-container-low + shadow-elev-1
 *  - filled:             bg-surface-container-highest, no shadow
 *  - outlined:           border + transparent bg (on surface)
 */
type Variant = 'elevated' | 'filled' | 'outlined';

type Props = HTMLAttributes<HTMLDivElement> & {
  variant?: Variant;
  interactive?: boolean;
  padded?: boolean;
  /* back-compat */
  elevation?: 0 | 1 | 2 | 3;
  surface?: 'default' | 'muted' | 'raised';
};

export const Card = forwardRef<HTMLDivElement, Props>(function Card(
  { variant = 'elevated', interactive, padded = true, elevation, className, children, ...rest },
  ref,
) {
  // Back-compat: elevation=0 → outlined
  const resolved: Variant = elevation === 0 ? 'outlined' : variant;

  const styles: Record<Variant, string> = {
    elevated:
      'bg-surface-container-low shadow-elev-1 ' +
      (interactive ? 'hover:shadow-elev-3 hover:bg-surface-container' : ''),
    filled:
      'bg-surface-container-highest ' +
      (interactive ? 'hover:bg-surface-container-high' : ''),
    outlined:
      'bg-surface border border-outline-variant ' +
      (interactive ? 'hover:border-outline hover:bg-surface-container-low' : ''),
  };

  return (
    <div
      ref={ref}
      className={cn(
        'rounded-md transition-all duration-200 ease-standard',
        styles[resolved],
        interactive && 'cursor-pointer',
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
  return <h3 className={cn('text-title-md text-on-surface', className)} {...rest} />;
}

export function CardDescription({ className, ...rest }: HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cn('text-body-sm text-on-surface-variant mt-1', className)} {...rest} />;
}
