'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { cn } from '@/lib/cn';
import { Chip } from '@/components/ui/Chip';
import { useToast } from '@/components/ui/Toast';
import { Check, ChevronRight } from '@/components/icons';
import { ROLE_LABELS, ROLE_TONE, type Role, type JourneyScope } from '@/lib/types';

export type JourneyClientItem = {
  id: string;
  title: string;
  hint: string | null;
  role: Role | null;
  done: boolean;
  doneByName: string | null;
  canToggle: boolean;
  href?: string | null; // 唯讀(CYCLE)項目的快捷跳轉目的地
  informational?: boolean; // 純提醒(無系統訊號可判定)→ 不勾選、不計分、不跳轉
};
export type JourneyClientStage = {
  id: string;
  stageKey: string;
  title: string;
  summary: string | null;
  items: JourneyClientItem[];
};

/**
 * 引導式精靈各階段可勾選清單(週期頁 / 中心年度 runbook 共用)。
 * 勾選 → POST /api/journey/progress;樂觀更新,失敗回復並提示。
 */
export function JourneyChecklist({
  scope,
  binding,
  stages: initialStages,
  defaultOpenStageKey,
  showRoleChips = false,
}: {
  scope: JourneyScope;
  binding: { cycleId?: string; programmeYear?: number };
  stages: JourneyClientStage[];
  defaultOpenStageKey?: string;
  showRoleChips?: boolean;
}) {
  const toast = useToast();
  const [stages, setStages] = useState(initialStages);
  const [open, setOpen] = useState<Set<string>>(
    () => new Set(defaultOpenStageKey ? [defaultOpenStageKey] : initialStages.map((s) => s.stageKey)),
  );
  const [pending, setPending] = useState<Set<string>>(new Set());

  // CYCLE 為唯讀(server 依系統實況計算);router.refresh 軟刷新後同步最新進度。
  // PROGRAMME 走樂觀更新、自管 state,不覆寫。
  useEffect(() => {
    if (scope === 'CYCLE') setStages(initialStages);
  }, [initialStages, scope]);

  function toggleOpen(key: string) {
    setOpen((prev) => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  }

  function setItemDone(itemId: string, done: boolean, doneByName: string | null) {
    setStages((prev) =>
      prev.map((s) => ({
        ...s,
        items: s.items.map((it) => (it.id === itemId ? { ...it, done, doneByName } : it)),
      })),
    );
  }

  async function toggleItem(it: JourneyClientItem) {
    if (!it.canToggle || pending.has(it.id)) return;
    const next = !it.done;
    setPending((p) => new Set(p).add(it.id));
    setItemDone(it.id, next, next ? '儲存中…' : null); // 樂觀
    const res = await fetch('/api/journey/progress', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        itemId: it.id,
        scope,
        cycleId: binding.cycleId,
        programmeYear: binding.programmeYear,
        done: next,
      }),
    }).catch(() => null);
    setPending((p) => {
      const n = new Set(p);
      n.delete(it.id);
      return n;
    });
    if (!res || !res.ok) {
      setItemDone(it.id, it.done, it.doneByName); // 回復
      const j = res ? await res.json().catch(() => ({})) : {};
      toast.error('儲存失敗', (j as { error?: string }).error);
      return;
    }
    const j = (await res.json().catch(() => ({}))) as { progress?: { doneByName: string | null } };
    setItemDone(it.id, next, next ? j.progress?.doneByName ?? null : null);
  }

  return (
    <div className="flex flex-col gap-3">
      {stages.map((s) => {
        const countable = s.items.filter((i) => !i.informational); // 純提醒不計入 X/Y
        const total = countable.length;
        const done = countable.filter((i) => i.done).length;
        const allDone = total > 0 && done === total;
        const reminderCount = s.items.length - countable.length; // 純提醒項數(委員「到場查核」等軟性任務)
        const isOpen = open.has(s.stageKey);
        return (
          <div key={s.id} className="rounded-lg border border-outline-variant/70 bg-surface-container-low overflow-hidden">
            <button
              type="button"
              onClick={() => toggleOpen(s.stageKey)}
              aria-expanded={isOpen}
              className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-surface-container focus-ring"
            >
              <ChevronRight
                size={16}
                className={cn('shrink-0 text-on-surface-variant transition-transform', isOpen && 'rotate-90')}
                aria-hidden
              />
              <span className="flex-1 min-w-0">
                <span className="text-title-md text-on-surface">{s.title}</span>
                {s.summary && <span className="block mt-0.5 text-caption text-on-surface-variant">{s.summary}</span>}
              </span>
              {total > 0 ? (
                <Chip tone={allDone ? 'success' : 'neutral'} size="sm">
                  <span className="tabular-nums">{done}/{total}</span>
                </Chip>
              ) : reminderCount > 0 ? (
                <Chip tone="neutral" size="sm">{reminderCount} 項提醒</Chip>
              ) : null}
            </button>

            {isOpen && (
              <ul className="border-t border-outline-variant/60 divide-y divide-outline-variant/40">
                {s.items.length === 0 ? (
                  <li className="px-4 py-3 text-caption text-on-surface-variant">此階段尚無項目</li>
                ) : (
                  s.items.map((it) => {
                    const rowClass = cn(
                      'w-full flex items-start gap-3 px-4 py-2.5 text-left min-h-11',
                      it.canToggle || it.href ? 'hover:bg-surface-container focus-ring cursor-pointer' : 'cursor-default',
                    );
                    const inner = (
                      <>
                        {it.informational ? (
                          // 純提醒:小圓點(非勾選框)——不可勾、不計分、不跳轉
                          <span className="mt-[7px] shrink-0 w-1.5 h-1.5 rounded-full bg-outline-variant" aria-hidden />
                        ) : (
                          <span
                            className={cn(
                              'mt-0.5 shrink-0 w-5 h-5 rounded-md border flex items-center justify-center transition-colors',
                              it.done ? 'bg-primary-600 border-primary-600 text-white' : 'border-outline bg-surface',
                              !it.canToggle && !it.done && 'opacity-60',
                            )}
                            aria-hidden
                          >
                            {it.done && <Check size={13} />}
                          </span>
                        )}
                        <span className="min-w-0 flex-1">
                          <span className="flex items-center gap-2 flex-wrap">
                            <span
                              className={cn(
                                'text-body-sm',
                                it.informational
                                  ? 'text-on-surface-variant'
                                  : it.done
                                    ? 'text-on-surface-variant line-through'
                                    : 'text-on-surface',
                              )}
                            >
                              {it.title}
                            </span>
                            {showRoleChips && it.role && (
                              <Chip tone={ROLE_TONE[it.role]} size="sm">{ROLE_LABELS[it.role]}</Chip>
                            )}
                            {it.informational && (
                              <span className="text-label-sm text-on-surface-variant">提醒</span>
                            )}
                          </span>
                          {it.hint && <span className="block mt-0.5 text-caption text-on-surface-variant">{it.hint}</span>}
                          {!it.informational && it.done && it.doneByName && (
                            <span className="block mt-0.5 text-label-sm text-success-700">已完成 · {it.doneByName}</span>
                          )}
                        </span>
                        {it.href && !it.informational && (
                          <ChevronRight size={15} className="self-center shrink-0 text-on-surface-variant" aria-hidden />
                        )}
                      </>
                    );
                    return (
                      <li key={it.id}>
                        {it.canToggle ? (
                          <button type="button" onClick={() => toggleItem(it)} aria-pressed={it.done} className={rowClass}>
                            {inner}
                          </button>
                        ) : it.href ? (
                          <Link href={it.href} className={rowClass}>{inner}</Link>
                        ) : (
                          <div className={rowClass}>{inner}</div>
                        )}
                      </li>
                    );
                  })
                )}
              </ul>
            )}
          </div>
        );
      })}
    </div>
  );
}
