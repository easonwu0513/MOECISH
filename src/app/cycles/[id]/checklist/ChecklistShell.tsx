'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { cn } from '@/lib/cn';
import { TextField } from '@/components/ui/TextField';
import { Button } from '@/components/ui/Button';
import { Chip } from '@/components/ui/Chip';
import { ProgressBar } from '@/components/ui/ProgressBar';
import { Tooltip } from '@/components/ui/Tooltip';
import { EmptyState } from '@/components/ui/EmptyState';
import { ConfirmDialog } from '@/components/ui/Dialog';
import { useToast } from '@/components/ui/Toast';
import { Search, X, ChevronDown, ChevronUp, Check } from '@/components/icons';
import { DIMENSION_LABELS, DIMENSION_ORDER } from '@/lib/dimension';
import type { ComplianceLevel, Dimension } from '@/lib/types';
import { EMPTY } from '@/lib/copy';
import { FilterChipButton } from '@/components/ui/FilterChip';
import ChecklistItemCard from './ChecklistItemCard';
import SubmissionBanner from './SubmissionBanner';

export type ClientItem = {
  id: string;
  itemNo: string;
  content: string;
  dimension: Dimension;
  orderIndex: number;
  auditBasis: string | null;
  auditFocus: string | null;
  expectedEvidence: string | null;
};

export type ClientResponse = {
  id: string;
  checklistItemId: string;
  compliance: ComplianceLevel | null;
  description: string | null;
  recordDocs: string | null;
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
  canSubmit = false,
  canReopen = false,
  submittedAtISO = null,
  submittedBy = null,
  reopenNote = null,
}: {
  cycleId: string;
  items: ClientItem[];
  responses: ClientResponse[];
  canEdit: boolean;
  userRole: string;
  /** 機關管理員且週期狀態開放時可送出 */
  canSubmit?: boolean;
  /** 委員(受指派)/最高管理員可退回 */
  canReopen?: boolean;
  submittedAtISO?: string | null;
  submittedBy?: string | null;
  reopenNote?: string | null;
}) {
  const responsesByItem = useMemo(() => {
    const m = new Map<string, ClientResponse>();
    for (const r of responses) m.set(r.checklistItemId, r);
    return m;
  }, [responses]);

  const router = useRouter();
  const toast = useToast();
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<FilterKey>('all');
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [focusedIdx, setFocusedIdx] = useState(0);
  const [collapsedDims, setCollapsedDims] = useState<Set<string>>(new Set());
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [submitOpen, setSubmitOpen] = useState(false);
  const [submitBusy, setSubmitBusy] = useState(false);

  // 完成填報送出(全數作答才可送;送出後鎖定,需委員退回才能再修改)
  async function submitChecklist() {
    setSubmitBusy(true);
    const res = await fetch(`/api/cycles/${cycleId}/checklist/submit`, { method: 'POST' });
    setSubmitBusy(false);
    setSubmitOpen(false);
    if (!res.ok) {
      const j = await res.json().catch(() => ({ error: '送出失敗' }));
      toast.error('送出失敗', j.error);
      return;
    }
    toast.success('填報已送出', '稽核委員將收到通知信,內容已鎖定。');
    router.refresh();
  }

  // 一鍵將未作答全部標為符合(之後逐題調整例外)
  async function bulkCompliant() {
    setBulkBusy(true);
    const res = await fetch(`/api/cycles/${cycleId}/checklist/bulk`, { method: 'POST' });
    setBulkBusy(false);
    setBulkOpen(false);
    if (!res.ok) {
      const j = await res.json().catch(() => ({ error: '操作失敗' }));
      toast.error('操作失敗', j.error);
      return;
    }
    const j = await res.json();
    toast.success('已批次標記', `${j.updated} 題標為「符合」;請逐題確認並調整例外。`);
    router.refresh();
  }

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

  // j/k 導覽只走「展開構面」內的題目,不跳進收合(已從 DOM 卸載)的卡片
  const flatIds = useMemo(
    () => grouped.filter((g) => !collapsedDims.has(g.dim)).flatMap((g) => g.items.map((i) => i.id)),
    [grouped, collapsedDims],
  );

  function toggle(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
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
      <SubmissionBanner
        cycleId={cycleId}
        submittedAtISO={submittedAtISO}
        submittedBy={submittedBy}
        reopenNote={reopenNote}
        canReopen={canReopen}
      />
      <ConfirmDialog
        open={submitOpen}
        onOpenChange={(o) => !submitBusy && setSubmitOpen(o)}
        title="完成填報並送出"
        description={`將送出全部 ${total} 題填報結果。送出後內容鎖定、稽核委員會收到通知開始審閱;如需再修改,須由委員退回重填。確定送出?`}
        confirmLabel="確認送出"
        tone="primary"
        onConfirm={submitChecklist}
        loading={submitBusy}
      />
      <ConfirmDialog
        open={bulkOpen}
        onOpenChange={(o) => !bulkBusy && setBulkOpen(o)}
        title="未作答全部標為符合"
        description={`將把 ${total - filled} 題未作答項目標為「符合」(已作答的不會被覆寫)。之後請逐題確認,把例外調整為部分符合/不符合/不適用。確定執行?`}
        confirmLabel="全部標為符合"
        tone="primary"
        onConfirm={bulkCompliant}
        loading={bulkBusy}
      />
      {/* Sticky toolbar */}
      <div className="sticky top-16 z-20 -mx-4 sm:-mx-6 lg:-mx-8 px-4 sm:px-6 lg:px-8 pt-3 pb-4 bg-surface-container-lowest/95 backdrop-blur-sm border-b border-outline-variant/60 mb-6">
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
            {canEdit && filled < total && (
              <Button size="sm" variant="tonal" onClick={() => setBulkOpen(true)} leadingIcon={<Check size={14} />}>
                未答全標符合
              </Button>
            )}
            <Button size="sm" variant="text" onClick={expandUnanswered} leadingIcon={<ChevronDown size={14} />}>
              展開未作答
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
        <div className="mt-3 flex flex-wrap gap-1.5" role="group" aria-label="篩選題目">
          {filterOptions.map((f) => (
            <FilterChipButton key={f.key} selected={filter === f.key} onClick={() => setFilter(f.key)}>
              {f.label}
            </FilterChipButton>
          ))}
        </div>

        {/* Progress */}
        <div className="mt-3 flex items-center gap-4">
          <div className="flex-1">
            <ProgressBar value={filled} max={total} tone="primary" size="sm" />
          </div>
          <div className="text-body-sm text-on-surface-variant tabular-nums">
            <span className="font-semibold text-on-surface">{filled}</span> / {total} <span className="text-on-surface-variant">({pct}%)</span>
            {search || filter !== 'all' ? (
              <span className="ml-2 text-caption text-on-surface-variant">· 顯示 {visible.length} 題</span>
            ) : null}
          </div>
          {canSubmit && !submittedAtISO && (
            filled < total ? (
              <Button
                size="sm"
                variant="filled"
                aria-disabled="true"
                aria-describedby="submit-block-reason"
                onClick={(e) => e.preventDefault()}
                className="opacity-40 cursor-not-allowed"
              >
                完成送出
              </Button>
            ) : (
              <Button size="sm" variant="filled" onClick={() => setSubmitOpen(true)}>
                完成送出
              </Button>
            )
          )}
          <Tooltip content="快捷鍵：j/k 移動聚焦 · Enter 展開 · 1-4 對聚焦題選符合度">
            <span className="kbd">?</span>
          </Tooltip>
        </div>

        {/* 送出阻擋原因:常駐(觸控/鍵盤皆可見,不只藏在 hover Tooltip) */}
        {canSubmit && !submittedAtISO && filled < total && (
          <p id="submit-block-reason" className="mt-2 text-caption text-warning-700">
            尚餘 {total - filled} 題未作答,沒有的項目請選「不適用」後即可送出。
          </p>
        )}
      </div>

      {/* Content */}
      {noResult ? (
        <EmptyState
          icon={<Search size={24} />}
          title={EMPTY.noResults.title}
          description={EMPTY.noResults.description}
          action={<Button variant="outlined" onClick={() => { setSearch(''); setFilter('all'); }}>清除條件</Button>}
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
