'use client';

import { ReactNode, useState } from 'react';
import { cn } from '@/lib/cn';

export type Tab = {
  id: string;
  label: ReactNode;
  badge?: ReactNode;
  content: ReactNode;
};

/**
 * Material 3 primary tabs — active underline indicator, equal-weight labels.
 */
export function Tabs({
  tabs,
  defaultTabId,
  className,
}: {
  tabs: Tab[];
  defaultTabId?: string;
  className?: string;
}) {
  const [active, setActive] = useState(defaultTabId ?? tabs[0]?.id);
  const current = tabs.find((t) => t.id === active) ?? tabs[0];

  return (
    <div className={cn('', className)}>
      <div role="tablist" className="flex border-b border-outline-variant">
        {tabs.map((t) => {
          const selected = t.id === active;
          return (
            <button
              key={t.id}
              role="tab"
              aria-selected={selected}
              onClick={() => setActive(t.id)}
              className={cn(
                'relative px-5 h-12 text-label-lg font-medium transition-colors duration-200 ease-standard focus-ring',
                selected
                  ? 'text-primary-700'
                  : 'text-on-surface-variant hover:text-on-surface hover:bg-surface-container/50',
              )}
            >
              <span className="inline-flex items-center gap-1.5">
                {t.label}
                {t.badge}
              </span>
              {selected && (
                <span className="absolute left-0 right-0 -bottom-px h-[3px] bg-primary-600 rounded-t-full" />
              )}
            </button>
          );
        })}
      </div>
      <div role="tabpanel" className="pt-5">
        {current?.content}
      </div>
    </div>
  );
}
