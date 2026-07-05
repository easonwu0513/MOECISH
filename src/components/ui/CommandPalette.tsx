'use client';

import { Fragment, ReactNode, useEffect, useId, useMemo, useRef, useState } from 'react';
import { cn } from '@/lib/cn';
import { Search, ChevronRight } from '../icons';

export type Command = {
  id: string;
  label: string;
  hint?: string;
  icon?: ReactNode;
  keywords?: string;
  action: () => void | Promise<void>;
  group?: string;
};

export function CommandPalette({
  open,
  onOpenChange,
  commands,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  commands: Command[];
}) {
  const [q, setQ] = useState('');
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listId = useId();

  useEffect(() => {
    if (open) {
      setQ('');
      setActive(0);
      requestAnimationFrame(() => inputRef.current?.focus());
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [open]);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return commands;
    return commands.filter((c) =>
      `${c.label} ${c.keywords ?? ''} ${c.group ?? ''}`.toLowerCase().includes(s),
    );
  }, [q, commands]);

  useEffect(() => { setActive(0); }, [q]);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.preventDefault();
        onOpenChange(false);
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        setActive((i) => Math.min(filtered.length - 1, i + 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setActive((i) => Math.max(0, i - 1));
      } else if (e.key === 'Enter') {
        e.preventDefault();
        const cmd = filtered[active];
        if (cmd) {
          cmd.action();
          onOpenChange(false);
        }
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, filtered, active, onOpenChange]);

  if (!open) return null;

  // Group by group name
  const groups = new Map<string, Command[]>();
  for (const c of filtered) {
    const g = c.group ?? '操作';
    if (!groups.has(g)) groups.set(g, []);
    groups.get(g)!.push(c);
  }

  let idx = 0;
  const activeId = filtered.length ? `${listId}-opt-${active}` : undefined;

  return (
    <div className="fixed inset-0 z-[95] animate-fade-in" role="dialog" aria-modal="true" aria-label="命令面板">
      <div className="absolute inset-0 scrim" onClick={() => onOpenChange(false)} />
      <div className="relative mx-auto mt-24 w-[min(96%,640px)] bg-card rounded-lg shadow-elev-5 border border-rule overflow-hidden animate-slide-up">
        <div className="flex items-center gap-2 px-4 py-3 border-b border-rule">
          <Search size={18} className="text-ink-500 shrink-0" />
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="搜尋指令、頁面、動作…"
            role="combobox"
            aria-expanded="true"
            aria-controls={listId}
            aria-activedescendant={activeId}
            aria-autocomplete="list"
            className="flex-1 bg-transparent outline-none text-body text-ink-900 placeholder:text-ink-500"
          />
          <span className="kbd">Esc</span>
        </div>
        <div className="max-h-[60vh] overflow-y-auto scrollbar-thin py-2">
          {filtered.length === 0 ? (
            <div className="px-4 py-10 text-center text-body-sm text-ink-500">找不到符合的指令</div>
          ) : (
            <ul role="listbox" id={listId}>
              {Array.from(groups.entries()).map(([g, list]) => (
                <Fragment key={g}>
                  <li role="presentation" className="px-4 py-1 mt-1 first:mt-0 text-caption text-ink-500 uppercase tracking-wider">
                    {g}
                  </li>
                  {list.map((c) => {
                    const myIdx = idx;
                    idx++;
                    const selected = myIdx === active;
                    return (
                      <li key={c.id} id={`${listId}-opt-${myIdx}`} role="option" aria-selected={selected}>
                        <button
                          onMouseEnter={() => setActive(myIdx)}
                          onClick={() => { c.action(); onOpenChange(false); }}
                          className={cn(
                            'w-full flex items-center gap-3 px-4 py-2.5 text-body-sm transition-colors',
                            selected ? 'bg-focus-wash text-primary-700' : 'text-ink-900 hover:bg-rule',
                          )}
                        >
                          {c.icon && <span className={selected ? 'text-primary-700' : 'text-ink-500'}>{c.icon}</span>}
                          <span className="flex-1 text-left">{c.label}</span>
                          {c.hint && <span className={cn('text-caption', selected ? 'text-primary-700/80' : 'text-ink-500')}>{c.hint}</span>}
                          <ChevronRight size={14} className={selected ? 'text-primary-700' : 'text-rule'} />
                        </button>
                      </li>
                    );
                  })}
                </Fragment>
              ))}
            </ul>
          )}
        </div>
        <div className="flex items-center justify-between px-4 py-2 border-t border-rule text-caption text-ink-500 bg-paper-sunk">
          <span className="flex items-center gap-1.5">
            <span className="kbd">↑</span>
            <span className="kbd">↓</span>
            <span>移動</span>
            <span className="kbd ml-2">Enter</span>
            <span>選擇</span>
          </span>
          <span className="flex items-center gap-1">
            <span className="kbd">⌘K</span>
            <span>切換</span>
          </span>
        </div>
      </div>
    </div>
  );
}

export function useCommandHotkey(setOpen: (o: boolean) => void) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setOpen(true);
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [setOpen]);
}
