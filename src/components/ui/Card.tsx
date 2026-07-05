import { forwardRef, HTMLAttributes } from 'react';
import { cn } from '@/lib/cn';

/**
 * 靜謐文件工作坊 Card variants(批 B7):
 *  - elevated (default): bg-card(白卡)+ shadow-elev-1;interactive hover 抬升陰影
 *  - filled:             bg-paper-sunk(凹陷面板,無陰影);interactive hover 微深
 *  - outlined:           bg-card + border-rule 髮絲框;interactive hover 深框+凹陷底
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
      'bg-card shadow-elev-1 ' +
      (interactive ? 'hover:shadow-elev-3' : ''),
    filled:
      'bg-paper-sunk ' +
      (interactive ? 'hover:bg-rule-strong' : ''),
    outlined:
      'bg-card border border-rule ' +
      (interactive ? 'hover:border-rule-strong hover:bg-paper-sunk' : ''),
  };

  return (
    <div
      ref={ref}
      className={cn(
        'rounded-lg transition-all duration-200 ease-standard',
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
  return <h3 className={cn('text-title-md text-ink-900', className)} {...rest} />;
}

export function CardDescription({ className, ...rest }: HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cn('text-body-sm text-ink-500 mt-1', className)} {...rest} />;
}
