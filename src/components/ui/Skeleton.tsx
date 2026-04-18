import { cn } from '@/lib/cn';

export function Skeleton({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        'animate-pulse bg-neutral-200 rounded-md',
        className,
      )}
      aria-hidden
    />
  );
}

export function SkeletonLine({ width = 'full' }: { width?: 'full' | string }) {
  return (
    <Skeleton
      className={cn('h-4', typeof width === 'string' && width !== 'full' ? width : 'w-full')}
    />
  );
}
