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
    <div className={cn('flex flex-col items-center justify-center text-center py-10 px-6', className)}>
      {icon && (
        <div className="mb-4 w-14 h-14 rounded-full bg-neutral-100 text-neutral-400 flex items-center justify-center">
          {icon}
        </div>
      )}
      <h3 className="text-title text-neutral-800">{title}</h3>
      {description && (
        <p className="mt-1.5 text-body-sm text-neutral-500 max-w-md text-balance">
          {description}
        </p>
      )}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}
