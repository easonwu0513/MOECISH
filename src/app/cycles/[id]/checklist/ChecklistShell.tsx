'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { cn } from '@/lib/cn';
import { TextField } from '@/components/ui/TextField';
import { Button } from '@/components/ui/Button';
import { Chip } from '@/components/ui/Chip';
import { ProgressBar } from '@/components/ui/ProgressBar';
import { Tooltip } from '@/components/ui/Tooltip';
import { EmptyState } from '@/components/ui/EmptyState';
import { Search, X, ChevronDown, ChevronUp } from '@/components/icons';
import { DIMENSION_LABELS, DIMENSION_ORDER } from '@/lib/dimension';
import type { ComplianceLevel, Dimension } from '@/lib/types';
import { EMPTY } from '@/lib/copy';
import ChecklistItemCard from './ChecklistItemCard';

export type ClientItem = {
  id: string;
  itemNo: string;
  content: string;
  dimension: Dimension;
  orderIndex: number;
};

export type ClientResponse = {
  id: string;
  checklistItemId: string;
  compliance: ComplianceLevel | null;
  description: string | null;
  version: number;
  comments: {
    id: string;
    content: string;
    round: number;
    resolvedAt: Date | string | null;
    createdAt: Date | string;
  }[];
};

type FilterKey = 'all' | 'unanswered' | 'compliant' | 'partial' | 'noncompliant' | 'na' | 'comments';

const filterOptions: { key: FilterKey; label: string; tone?: 'success' | 'warning' | 'danger' | 'neutral' }[] = [
  { key: 'all',           label: '全部' },
  { key: 'unanswered',    label: '未作答' },
  { key: 'compliant',     label: '符合',       tone: 'success' },
  { key: 'partial',       label: '部分符合',   tone: 'warning' },
  { key: 'noncompliant',  label: '不符合',     tone: 'danger' },
  { key: 'na',            label: '不適用',     tone: 'neutral' },
  { key: 'comments',      label: '有意見待補' },
];

export default function ChecklistShell({
  cycleId,
  items,
  responses,
  canEdit,
  userRole,
}: {
  cycleId: string;
  items: ClientItem[];
  responses: ClientResponse[];
  canEdit: boolean;
  userRole: string;
}) {
  const responsesByItem = useMemo(() => {
    const m = new Map<string, ClientResponse>();
    for (const r of responses) m.set(r.checklistItemId, r);
    return m;
  }, [responses]);

  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<FilterKey>('all');
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [focusedIdx, setFocusedIdx] = useState(0);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return items.filter((it) => {
      if (q && !(`${it.itemNo} ${it.content}`.toLowerCase().includes(q))) return false;
      const r = responsesByItem.get(it.id);
      const c = r?.compliance ?? null;
      switch (filter) {
        case 'unanswered': return !c;
        case 'compliant': return c === 'COMPLIANT';
        case 'partial': return c === 'PARTIALLY_COMPLIANT';
        case 'noncompliant': return c === 'NON_COMPLIANT';
        case 'na': return c === 'NOT_APPLICABLE';
        case 'comments':
          return (r?.comments ?? []).some((cm) => !cm.resolvedAt);
        default: return true;
      }
    });
  }, [items, responsesByItem, search, filter]);

  const total = items.length;
  const filled = items.filter((it) => responsesByItem.get(it.id)?.compliance).length;
  const pct = total ? Math.round((filled / total) * 100) : 0;

  // Group visible items by dimension
  const grouped = useMemo(() => {
    return DIMENSION_ORDER
      .map((dim) => ({
        dim,
        items: visible.filter((i) => i.dimension === dim),
      }))
      .filter((g) => g.items.length > 0);
  }, [visible]);

  const flatIds = useMemo(() => grouped.flatMap((g) => g.items.map((i) => i.id)), [grouped]);

  function toggle(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function expandAll() {
    setExpanded(new Set(visible.map((i) => i.id)));
  }
  function collapseAll() {
    setExpanded(new Set());
  }
  function expandUnanswered() {
    const unans = visible
      .filter((i) => !responsesByItem.get(i.id)?.compliance)
      .map((i) => i.id);
    setExpanded(new Set(unans));
  }

  // Keyboard shortcuts
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const target = e.target as HTMLElement;
      if (target?.tagName === 'INPUT' || target?.tagName === 'TEXTAREA' || target?.isContentEditable) return;
      if (flatIds.length === 0) return;

      if (e.key === 'j' || e.key === 'ArrowDown') {
        e.preventDefault();
        setFocusedIdx((i) => Math.min(flatIds.length - 1, i + 1));
      } else if (e.key === 'k' || e.key === 'ArrowUp') {
        e.preventDefault();
        setFocusedIdx((i) => Math.max(0, i - 1));
      } else if (e.key === 'Enter') {
        e.preventDefault();
        toggle(flatIds[focusedIdx]);
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [flatIds, focusedIdx]);

  // Scroll focused into view
  const containerRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = containerRef.current?.querySelector<HTMLElement>(`[data-item-id="${flatIds[focusedIdx]}"]`);
    el?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [focusedIdx, flatIds]);

  const noResult = visible.length === 0;

  return (
    <div ref={containerRef}>
      {/* Sticky toolbar */}
      <div className="sticky top-14 z-20 -mx-4 sm:-mx-6 lg:-mx-8 px-4 sm:px-6 lg:px-8 pt-3 pb-4 bg-white/95 backdrop-blur-sm border-b border-hairline mb-6">
        <div className="flex flex-col sm:flex-row sm:items-center gap-4">
          <div className="flex-1 max-w-md">
            <TextField
              leadingIcon={<Search size={16} />}
              placeholder="搜尋題號或題目內容…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              trailingIcon={search ? (
                <button onClick={() => setSearch('')} aria-label="清除搜尋"><X size={14} /></button>
              ) : undefined}
            />
          </div>
          <div className="flex items-center gap-2">
            <Button size="sm" variant="ghost" onClick={expandUnanswered} leadingIcon={<ChevronDown size={14} />}>
              展開未作答
            </Button>
            <Button size="sm" variant="ghost" onClick={expandAll} leadingIcon={<ChevronDown size={14} />}>
              展開全部
            </Button>
            <Button size="sm" variant="ghost" onClick={collapseAll} leadingIcon={<ChevronUp size={14} />}>
              收合全部
            </Button>
          </div>
        </div>

        {/* Filters */}
        <div className="mt-3 flex flex-wrap gap-1.5">
          {filterOptions.map((f) => (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              className={cn(
                'h-7 px-3 rounded-full text-label transition-colors focus-ring border',
                filter === f.key
                  ? 'bg-primary-600 text-white border-primary-600'
                  : 'bg-white text-neutral-600 border-neutral-200 hover:border-neutral-400',
              )}
            >
              {f.label}
            </button>
          ))}
        </div>

        {/* Progress */}
        <div className="mt-3 flex items-center gap-4">
          <div className="flex-1">
            <ProgressBar value={filled} max={total} tone="primary" size="sm" />
          </div>
          <div className="text-body-sm text-neutral-600 tabular-nums">
            <span className="font-semibold text-neutral-900">{filled}</span> / {total} <span className="text-neutral-400">({pct}%)</span>
            {search || filter !== 'all' ? (
              <span className="ml-2 text-caption text-neutral-500">· 顯示 {visible.length} 題</span>
            ) : null}
          </div>
          <Tooltip content="快捷鍵：j/k 移動 · Enter 展開 · 1/2/3/4 選符合度">
            <span className="kbd">?</span>
          </Tooltip>
        </div>
      </div>

      {/* Content */}
      {noResult ? (
        <EmptyState
          icon={<Search size={24} />}
          title={EMPTY.noResults.title}
          description={EMPTY.noResults.description}
          action={<Button variant="secondary" onClick={() => { setSearch(''); setFilter('all'); }}>清除條件</Button>}
        />
      ) : (
        grouped.map(({ dim, items }) => (
          <section key={dim} className="mb-10">
            <h2 id={`dim-${dim}`} className="flex items-center gap-2 text-title text-neutral-900 mb-4 scroll-mt-40">
              <span>{DIMENSION_LABELS[dim as Dimension]}</span>
              <Chip size="sm" tone="neutral">{items.length}</Chip>
            </h2>
            <div className="flex flex-col gap-3">
              {items.map((it) => {
                const r = responsesByItem.get(it.id);
                const isFocused = flatIds[focusedIdx] === it.id;
                return (
                  <ChecklistItemCard
                    key={it.id}
                    cycleId={cycleId}
                    item={it}
                    response={r ?? null}
                    canEdit={canEdit}
                    userRole={userRole}
                    expanded={expanded.has(it.id)}
                    onToggle={() => toggle(it.id)}
                    focused={isFocused}
                  />
                );
              })}
            </div>
          </section>
        ))
      )}
    </div>
  );
}
