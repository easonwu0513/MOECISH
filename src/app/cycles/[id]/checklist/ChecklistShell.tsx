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
  const [collapsedDims, setCollapsedDims] = useState<Set<string>>(new Set());

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

  function toggleDim(dim: string) {
    setCollapsedDims((prev) => {
      const next = new Set(prev);
      if (next.has(dim)) next.delete(dim); else next.add(dim);
      return next;
    });
  }
  function collapseAllDims() {
    setCollapsedDims(new Set(DIMENSION_ORDER));
  }
  function expandAllDims() {
    setCollapsedDims(new Set());
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
          <div className="flex items-center gap-1 flex-wrap">
            <span className="text-caption text-on-surface-variant ml-1 mr-1 hidden lg:inline">題目</span>
            <Button size="sm" variant="text" onClick={expandUnanswered} leadingIcon={<ChevronDown size={14} />}>
              未作答
            </Button>
            <Button size="sm" variant="text" onClick={expandAll} leadingIcon={<ChevronDown size={14} />}>
              全展開
            </Button>
            <Button size="sm" variant="text" onClick={collapseAll} leadingIcon={<ChevronUp size={14} />}>
              全收合
            </Button>
            <span className="mx-2 h-4 w-px bg-outline-variant hidden lg:inline-block" aria-hidden />
            <span className="text-caption text-on-surface-variant mr-1 hidden lg:inline">構面</span>
            <Button size="sm" variant="text" onClick={expandAllDims} leadingIcon={<ChevronDown size={14} />}>
              展開
            </Button>
            <Button size="sm" variant="text" onClick={collapseAllDims} leadingIcon={<ChevronUp size={14} />}>
              收合
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
        grouped.map(({ dim, items }) => {
          const dimCollapsed = collapsedDims.has(dim);
          const dimDone = items.filter((i) => responsesByItem.get(i.id)?.compliance).length;
          const dimPct = items.length > 0 ? Math.round((dimDone / items.length) * 100) : 0;
          return (
            <section key={dim} className="mb-5">
              <button
                id={`dim-${dim}`}
                type="button"
                onClick={() => toggleDim(dim)}
                aria-expanded={!dimCollapsed}
                className={cn(
                  'group w-full flex items-center gap-4 text-left rounded-md border transition-all duration-180 ease-standard focus-ring scroll-mt-40',
                  'bg-surface-container-lowest hover:bg-surface-container-low',
                  dimCollapsed ? 'border-outline-variant/60' : 'border-outline-variant/60 shadow-xs',
                  'px-5 py-3.5',
                )}
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h2 className="text-title-md text-on-surface">
                      {DIMENSION_LABELS[dim as Dimension]}
                    </h2>
                    <Chip size="sm" tone="neutral">{items.length}</Chip>
                    {dimPct === 100 && (
                      <Chip size="sm" tone="success" dot>已完成</Chip>
                    )}
                  </div>
                </div>
                <div className="hidden sm:flex items-center gap-3 w-40 shrink-0">
                  <div className="flex-1">
                    <ProgressBar value={dimDone} max={items.length} size="sm" tone={dimPct === 100 ? 'success' : 'primary'} />
                  </div>
                  <span className="text-caption text-on-surface-variant tabular-nums w-14 text-right">
                    <span className="font-semibold text-on-surface">{dimDone}</span>
                    <span className="text-on-surface-variant"> / {items.length}</span>
                  </span>
                </div>
                <ChevronDown
                  size={18}
                  className={cn(
                    'text-on-surface-variant shrink-0 transition-transform duration-180',
                    !dimCollapsed && 'rotate-180',
                  )}
                />
              </button>

              {!dimCollapsed && (
                <div className="mt-3 flex flex-col gap-3 animate-fade-in">
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
              )}
            </section>
          );
        })
      )}
    </div>
  );
}
