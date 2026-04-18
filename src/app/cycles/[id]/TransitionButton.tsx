'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { CYCLE_STATUS_LABELS } from '@/lib/state-machine';
import type { CycleStatus } from '@/lib/types';

export default function TransitionButton({
  cycleId,
  target,
}: {
  cycleId: string;
  target: CycleStatus;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function onClick() {
    if (!confirm(`確認將狀態推進至：${CYCLE_STATUS_LABELS[target]}？`)) return;
    setLoading(true);
    const res = await fetch(`/api/cycles/${cycleId}/transition`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ target }),
    });
    setLoading(false);
    if (!res.ok) {
      const j = await res.json().catch(() => ({ error: '轉換失敗' }));
      alert(j.error ?? '轉換失敗');
      return;
    }
    router.refresh();
  }

  return (
    <button
      onClick={onClick}
      disabled={loading}
      className="px-3 py-1.5 bg-brand-600 hover:bg-brand-700 text-white text-sm rounded-md disabled:opacity-60"
    >
      → {CYCLE_STATUS_LABELS[target]}
    </button>
  );
}
