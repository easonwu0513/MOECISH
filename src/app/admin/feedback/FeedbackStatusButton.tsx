'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/Button';
import { useToast } from '@/components/ui/Toast';

/** 問題回饋處理狀態切換鈕(中心):待處理 ⇄ 已處理。 */
export function FeedbackStatusButton({ id, status }: { id: string; status: 'OPEN' | 'RESOLVED' }) {
  const router = useRouter();
  const toast = useToast();
  const [busy, setBusy] = useState(false);

  async function toggle() {
    setBusy(true);
    try {
      const res = await fetch(`/api/feedback/${id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ status: status === 'OPEN' ? 'RESOLVED' : 'OPEN' }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({ error: '更新失敗' }));
        toast.error('更新失敗', (j as { error?: string }).error);
        return;
      }
      router.refresh();
    } catch {
      toast.error('更新失敗', '連線逾時或網路中斷，請稍後再試');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Button size="sm" variant={status === 'OPEN' ? 'tonal' : 'text'} onClick={toggle} loading={busy} disabled={busy}>
      {status === 'OPEN' ? '標記已處理' : '改回待處理'}
    </Button>
  );
}
