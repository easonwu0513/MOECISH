'use client';

import { ReactNode, useId, useRef, useState, type KeyboardEvent } from 'react';
import { cn } from '@/lib/cn';

export type Tab = {
  id: string;
  label: ReactNode;
  badge?: ReactNode;
  content: ReactNode;
};

/**
 * Material 3 primary tabs — active underline indicator, equal-weight labels.
 * 無障礙(批72):tab↔tabpanel 以 id/aria-controls/aria-labelledby 關聯、方向鍵 roving tabindex
 * (未選中 tab tabIndex=-1,←/→/Home/End 移動焦點並選中,對齊 Segmented 的鍵盤模型)。
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
  const btnRefs = useRef<Map<string, HTMLButtonElement | null>>(new Map());
  // useId 每個 Tabs 實例唯一前綴——同頁多組 Tabs(如多張展開的檢核卡)不會撞 DOM id(批72 修)
  const uid = useId();
  const tabId = (id: string) => `${uid}tab-${id}`;
  const panelId = (id: string) => `${uid}panel-${id}`;

  function onKey(e: KeyboardEvent<HTMLButtonElement>, idx: number) {
    let next = -1;
    if (e.key === 'ArrowRight') next = (idx + 1) % tabs.length;
    else if (e.key === 'ArrowLeft') next = (idx - 1 + tabs.length) % tabs.length;
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = tabs.length - 1;
    if (next < 0) return;
    e.preventDefault();
    const nt = tabs[next];
    setActive(nt.id);
    btnRefs.current.get(nt.id)?.focus();
  }

  return (
    <div className={cn('', className)}>
      <div role="tablist" className="flex border-b border-rule">
        {tabs.map((t, i) => {
          const selected = t.id === active;
          return (
            <button
              key={t.id}
              ref={(el) => { btnRefs.current.set(t.id, el); }}
              role="tab"
              id={tabId(t.id)}
              aria-selected={selected}
              aria-controls={panelId(t.id)}
              tabIndex={selected ? 0 : -1}
              onKeyDown={(e) => onKey(e, i)}
              onClick={() => setActive(t.id)}
              className={cn(
                'relative px-5 h-12 text-label-lg font-medium transition-colors duration-200 ease-standard focus-ring',
                selected
                  ? 'text-primary-700'
                  : 'text-ink-500 hover:text-ink-900 hover:bg-paper-sunk/50',
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
      <div role="tabpanel" id={panelId(current?.id ?? '')} aria-labelledby={tabId(current?.id ?? '')} tabIndex={0} className="pt-5 focus-ring rounded-md">
        {current?.content}
      </div>
    </div>
  );
}
