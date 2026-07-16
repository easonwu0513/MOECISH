import type { CSSProperties } from 'react';
import { cn } from '@/lib/cn';

export function Skeleton({ className, style }: { className?: string; style?: CSSProperties }) {
  return (
    <div
      className={cn(
        'animate-pulse bg-paper-sunk rounded-md',
        className,
      )}
      style={style}
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
