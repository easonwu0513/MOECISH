import { ReactNode } from 'react';
import { cn } from '@/lib/cn';

type NodeTone = 'neutral' | 'primary' | 'sage' | 'success' | 'warning' | 'danger';

export type TimelineNode = {
  id: string;
  tone?: NodeTone;
  icon?: ReactNode;
  pulse?: boolean;
  title: ReactNode;
  meta?: ReactNode;
  body?: ReactNode;
};

const dotColor: Record<NodeTone, string> = {
  neutral: 'bg-neutral-300 ring-neutral-100',
  primary: 'bg-primary-500 ring-primary-100',
  sage:    'bg-sage-500 ring-sage-100',
  success: 'bg-success-500 ring-success-100',
  warning: 'bg-warning-500 ring-warning-100',
  danger:  'bg-danger-500 ring-danger-100',
};

export function Timeline({ nodes, className }: { nodes: TimelineNode[]; className?: string }) {
  return (
    <ol className={cn('relative flex flex-col gap-5 pl-6', className)}>
      {/* vertical line */}
      <span className="absolute left-[9px] top-1.5 bottom-1.5 w-px bg-neutral-200" aria-hidden />
      {nodes.map((n) => {
        const tone = n.tone ?? 'neutral';
        return (
          <li key={n.id} className="relative">
            <span
              className={cn(
                'absolute -left-6 top-1 w-[18px] h-[18px] rounded-full ring-4 flex items-center justify-center text-white',
                dotColor[tone],
                n.pulse && 'animate-soft-pulse',
              )}
              aria-hidden
            >
              {n.icon}
            </span>
            <div>
              <div className="flex items-center gap-2 text-body-sm font-medium text-neutral-900">
                {n.title}
              </div>
              {n.meta && <div className="text-caption text-neutral-500 mt-0.5">{n.meta}</div>}
              {n.body && <div className="mt-2 text-body-sm text-neutral-700">{n.body}</div>}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
