'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { useToast } from '@/components/ui/Toast';
import { Megaphone } from '@/components/icons';

/**
 * 委員在「審閱時段尚未設定」的鎖定卡上,一鍵通知中心盡快設定審閱時段。
 * 成功後改為已通知狀態(24h 內後端去重,不會重複轟炸中心)。
 */
export default function RequestReviewWindowButton({ cycleId }: { cycleId: string }) {
  const toast = useToast();
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  async function run() {
    setLoading(true);
    const res = await fetch(`/api/cycles/${cycleId}/request-review-window`, { method: 'POST' });
    setLoading(false);
    if (!res.ok) {
      const j = await res.json().catch(() => ({ error: '通知失敗' }));
      toast.error('通知失敗', j.error);
      return;
    }
    const j = await res.json();
    setDone(true);
    if (j.recipientCount > 0) {
      toast.success('已通知中心', '已請中心盡快設定審閱時段；設定後即可開始審閱。');
    } else {
      toast.info('目前無可通知的中心人員', '請稍後再試或直接聯繫中心。');
    }
  }

  return (
    <Button size="sm" variant="tonal" leadingIcon={<Megaphone size={14} />} onClick={run} loading={loading} disabled={done}>
      {done ? '已通知中心' : '請中心設定審閱時段'}
    </Button>
  );
}
