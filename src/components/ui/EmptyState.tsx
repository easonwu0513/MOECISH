import { ReactNode } from 'react';
import { cn } from '@/lib/cn';

export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
}: {
  icon?: ReactNode;
  title: string;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('flex flex-col items-center justify-center text-center py-12 px-6', className)}>
      {icon && (
        <div className="mb-5 w-16 h-16 rounded-full bg-surface-container-high text-on-surface-variant flex items-center justify-center">
          {icon}
        </div>
      )}
      <h3 className="text-title-lg text-on-surface">{title}</h3>
      {description && (
        <p className="mt-2 text-body-sm text-on-surface-variant max-w-md text-balance leading-relaxed">
          {description}
        </p>
      )}
      {action && <div className="mt-6">{action}</div>}
    </div>
  );
}
