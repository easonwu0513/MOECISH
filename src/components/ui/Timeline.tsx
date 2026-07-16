import { ReactNode } from 'react';
import { cn } from '@/lib/cn';
import type { Tone } from '@/lib/tone';

export type TimelineNode = {
  id: string;
  tone?: Tone;
  icon?: ReactNode;
  pulse?: boolean;
  title: ReactNode;
  meta?: ReactNode;
  body?: ReactNode;
};

// 節點=實心圓點(bg-600)+淺色光暈環(ring-100)+白字;深淺對齊批72 統一實心 600(warning/danger 500→600)
const dotColor: Record<Tone, string> = {
  neutral: 'bg-rule-strong    ring-rule           text-ink-700',
  primary: 'bg-primary-600    ring-primary-100    text-white',
  sage:    'bg-sage-600       ring-sage-100       text-white',
  success: 'bg-success-600    ring-success-100    text-white',
  warning: 'bg-warning-600    ring-warning-100    text-white',
  danger:  'bg-danger-600     ring-danger-100     text-white',
};

export function Timeline({ nodes, className }: { nodes: TimelineNode[]; className?: string }) {
  return (
    <ol className={cn('relative flex flex-col gap-6 pl-8', className)}>
      <span className="absolute left-[11px] top-2 bottom-2 w-px bg-rule" aria-hidden />
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
              <div className="flex items-center gap-2 text-body-sm font-medium text-ink-900">
                {n.title}
              </div>
              {n.meta && <div className="text-caption text-ink-500 mt-0.5">{n.meta}</div>}
              {n.body && <div className="mt-2 text-body-sm text-ink-500 leading-relaxed">{n.body}</div>}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
