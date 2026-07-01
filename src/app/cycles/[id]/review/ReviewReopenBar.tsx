'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/Button';
import { useToast } from '@/components/ui/Toast';

/**
 * 審閱頁收尾動作(僅委員):
 * - 委員逐題留意見後按「意見填寫完成」通知中心(可取消重開)。
 * - 實地稽核當天之委員審閱僅為留存意見,不涉「退回機關重填」;正式回饋以稽核發現/缺失為準。
 */
export default function ReviewReopenBar({
  cycleId,
  role,
  openComments,
  reviewDone,
}: {
  cycleId: string;
  role: string;
  openComments: number;
  reviewDone: boolean;
}) {
  const router = useRouter();
  const toast = useToast();
  const [busy, setBusy] = useState(false);

  // 此收尾條僅供委員使用;其他角色不顯示。
  if (role !== 'AUDITOR') return null;

  async function markDone(done: boolean) {
    setBusy(true);
    const res = await fetch(`/api/cycles/${cycleId}/review/done`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ done }),
    });
    setBusy(false);
    if (!res.ok) {
      const j = await res.json().catch(() => ({ error: '操作失敗' }));
      toast.error('操作失敗', j.error);
      return;
    }
    toast.success(done ? '已標記意見填寫完成' : '已取消完成標記', done ? '中心將收到通知。' : undefined);
    router.refresh();
  }

  return (
    <div className="mt-8 rounded-md border border-outline-variant/60 bg-surface-container-lowest p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
      <div>
        <p className="text-title-md text-on-surface">{reviewDone ? '已標記:意見填寫完成' : '完成審閱'}</p>
        <p className="text-body-sm text-on-surface-variant mt-0.5">
          {reviewDone
            ? '中心已收到你完成審閱的通知。如需補充意見,可取消後再留言。'
            : openComments > 0
              ? `已留 ${openComments} 題意見。逐題意見留妥後,按「意見填寫完成」通知中心。`
              : '逐題意見留妥後,按「意見填寫完成」通知中心。'}
        </p>
      </div>
      {reviewDone ? (
        <Button variant="tonal" onClick={() => markDone(false)} loading={busy} className="shrink-0">取消完成標記</Button>
      ) : (
        <Button onClick={() => markDone(true)} loading={busy} className="shrink-0">意見填寫完成</Button>
      )}
    </div>
  );
}
