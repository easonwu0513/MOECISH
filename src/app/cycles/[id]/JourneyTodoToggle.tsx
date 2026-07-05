'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useToast } from '@/components/ui/Toast';
import { Check } from '@/components/icons';
import { cn } from '@/lib/cn';

/**
 * 週期頁待辦卡「必做・手動勾選」項的勾選框(client):
 * POST /api/journey/progress(CYCLE 綁 cycleId;後端限手動項+assertCycleAccess+角色檢核)。
 */
export default function JourneyTodoToggle({
  itemId,
  cycleId,
  done,
  title,
}: {
  itemId: string;
  cycleId: string;
  done: boolean;
  title: string;
}) {
  const router = useRouter();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [checked, setChecked] = useState(done);
  // router.refresh 後伺服器 prop 更新但 client state 保留 → 以 prop 重新同步(他人勾選也會反映)
  useEffect(() => { setChecked(done); }, [done]);

  async function toggle() {
    if (busy) return;
    const next = !checked;
    setBusy(true);
    setChecked(next); // 樂觀更新
    const res = await fetch('/api/journey/progress', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ itemId, scope: 'CYCLE', cycleId, done: next }),
    }).catch(() => null);
    setBusy(false);
    if (!res || !res.ok) {
      setChecked(!next); // 失敗回復
      const j = res ? await res.json().catch(() => ({})) : {};
      toast.error('更新失敗', (j as { error?: string }).error ?? '連線逾時,請稍後再試');
      return;
    }
    router.refresh();
  }

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={busy}
      aria-pressed={checked}
      aria-label={`${checked ? '取消勾選' : '勾選完成'}:${title}`}
      className={cn(
        'mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md border-2 transition-colors focus-ring disabled:opacity-50',
        checked ? 'border-success-600 bg-success-600 text-white' : 'border-neutral-400 hover:border-neutral-500',
      )}
    >
      {checked && <Check size={12} />}
    </button>
  );
}
