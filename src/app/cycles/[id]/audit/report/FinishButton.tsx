'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ui/Dialog';
import { useToast } from '@/components/ui/Toast';
import { CheckCircle } from '@/components/icons';

/**
 * 「已完成年度稽核」一鍵連動(SUPER_ADMIN):
 * 委員發現 → 自動建立完整缺失表 → 週期推進至矯正執行中 → 通知機關填報。
 */
export default function FinishButton({
  cycleId,
  pendingCount,
}: {
  cycleId: string;
  pendingCount: number;
}) {
  const router = useRouter();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  async function finish() {
    setBusy(true);
    const res = await fetch(`/api/cycles/${cycleId}/audit/finish`, { method: 'POST' });
    setBusy(false);
    setOpen(false);
    if (!res.ok) {
      const j = await res.json().catch(() => ({ error: '操作失敗' }));
      toast.error('完成稽核失敗', j.error);
      return;
    }
    const j = await res.json();
    toast.success(
      '年度稽核已完成',
      `已建立 ${j.converted} 項缺失(共 ${j.totalDeficiencies} 項),週期進入「矯正執行中」` +
        (j.notified > 0 ? `,並已通知 ${j.notified} 位機關管理員填報。` : '。'),
    );
    router.push(`/cycles/${cycleId}/deficiencies`);
    router.refresh();
  }

  return (
    <>
      <Button size="sm" leadingIcon={<CheckCircle size={15} />} onClick={() => setOpen(true)}>
        已完成年度稽核
      </Button>
      <ConfirmDialog
        open={open}
        onOpenChange={(o) => !busy && setOpen(o)}
        title="完成年度稽核"
        description={
          `將自動執行三件事:① 把全體委員的待改善/建議事項(${pendingCount} 條未轉)建立為完整稽核缺失表;` +
          `② 週期狀態推進至「矯正執行中」;③ 寄通知請機關管理員開始填報矯正措施。` +
          `法遵符合情形不會轉為缺失。確定執行?`
        }
        confirmLabel="確認完成稽核"
        tone="primary"
        onConfirm={finish}
        loading={busy}
      />
    </>
  );
}
