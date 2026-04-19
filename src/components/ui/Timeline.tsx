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
  neutral: 'bg-surface-container-high ring-surface-container text-on-surface-variant',
  primary: 'bg-primary-600    ring-primary-100    text-white',
  sage:    'bg-sage-600       ring-sage-100       text-white',
  success: 'bg-success-600    ring-success-100    text-white',
  warning: 'bg-warning-500    ring-warning-100    text-white',
  danger:  'bg-danger-500     ring-danger-100     text-white',
};

export function Timeline({ nodes, className }: { nodes: TimelineNode[]; className?: string }) {
  return (
    <ol className={cn('relative flex flex-col gap-6 pl-8', className)}>
      <span className="absolute left-[11px] top-2 bottom-2 w-px bg-outline-variant" aria-hidden />
      {nodes.map((n) => {
        const tone = n.tone ?? 'neutral';
        return (
          <li key={n.id} className="relative">
            <span
              className={cn(
                'absolute -left-8 top-0.5 w-[22px] h-[22px] rounded-full ring-4 flex items-center justify-center',
                dotColor[tone],
                n.pulse && 'animate-soft-pulse',
              )}
              aria-hidden
            >
              {n.icon}
            </span>
            <div>
              <div className="flex items-center gap-2 text-body-sm font-medium text-on-surface">
                {n.title}
              </div>
              {n.meta && <div className="text-caption text-on-surface-variant mt-0.5">{n.meta}</div>}
              {n.body && <div className="mt-2 text-body-sm text-on-surface-variant leading-relaxed">{n.body}</div>}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
