'use client';

import { ReactNode, useState } from 'react';
import { cn } from '@/lib/cn';

export type Tab = {
  id: string;
  label: ReactNode;
  badge?: ReactNode;
  content: ReactNode;
};

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
      <div role="tablist" className="flex gap-0.5 border-b border-neutral-200">
        {tabs.map((t) => {
          const selected = t.id === active;
          return (
            <button
              key={t.id}
              role="tab"
              aria-selected={selected}
              onClick={() => setActive(t.id)}
              className={cn(
                'relative px-4 py-2.5 text-body-sm font-medium transition-colors focus-ring rounded-t-md',
                selected
                  ? 'text-primary-700'
                  : 'text-neutral-500 hover:text-neutral-900',
              )}
            >
              <span className="inline-flex items-center gap-1.5">
                {t.label}
                {t.badge}
              </span>
              {selected && (
                <span className="absolute left-0 right-0 bottom-0 h-0.5 bg-primary-600 rounded-t" />
              )}
            </button>
          );
        })}
      </div>
      <div role="tabpanel" className="pt-4">
        {current?.content}
      </div>
    </div>
  );
}
