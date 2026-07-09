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
  blockReason,
  dueDateSet,
}: {
  cycleId: string;
  pendingCount: number;
  /** 非 null 時代表尚不可完成(如委員未全數定稿):按鈕停用並顯示原因。 */
  blockReason?: string | null;
  /** 是否已設定矯正截止日(dueDate)。未設定則完成稽核前先跳窗要求設定(批48 圖8)。 */
  dueDateSet?: boolean;
}) {
  const router = useRouter();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  // 未設矯正截止日時,點「已完成年度稽核」改跳「需先設定日期」提醒窗(而非確認窗)
  const [needDateOpen, setNeedDateOpen] = useState(false);
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

  if (blockReason) {
    return (
      <span className="inline-flex flex-col items-end gap-0.5">
        <Button size="sm" leadingIcon={<CheckCircle size={15} />} disabled title={`${blockReason},尚無法完成年度稽核`}>
          已完成年度稽核
        </Button>
        <span className="text-caption text-ink-500 text-right max-w-[16rem]">{blockReason},尚無法完成</span>
      </span>
    );
  }

  return (
    <>
      <Button
        size="sm"
        leadingIcon={<CheckCircle size={15} />}
        onClick={() => (dueDateSet ? setOpen(true) : setNeedDateOpen(true))}
      >
        已完成年度稽核
      </Button>
      <ConfirmDialog
        open={open}
        onOpenChange={(o) => !busy && setOpen(o)}
        title="完成年度稽核"
        description={
          `將自動執行三件事:① 把全體委員的待改善與建議事項(共 ${pendingCount} 條尚未轉入)建立為完整稽核缺失表;` +
          `② 週期狀態推進至「矯正執行中」;③ 寄通知請機關管理員開始填報矯正措施。` +
          `法遵符合情形不會轉為缺失。確定執行?`
        }
        confirmLabel="確認完成稽核"
        tone="primary"
        onConfirm={finish}
        loading={busy}
      />
      {/* 未設矯正截止日:完成稽核會讓週期進入矯正執行中、機關需依截止日填報,故先要求設定(批48 圖8) */}
      <ConfirmDialog
        open={needDateOpen}
        onOpenChange={setNeedDateOpen}
        title="尚未設定矯正截止日"
        description="「已完成年度稽核」會將週期推進至「矯正執行中」,機關須依「矯正截止日」填報矯正措施。請先於週期首頁「編輯日期」設定矯正截止日,再完成年度稽核。"
        confirmLabel="前往設定日期"
        tone="primary"
        onConfirm={() => {
          setNeedDateOpen(false);
          router.push(`/cycles/${cycleId}`);
        }}
      />
    </>
  );
}
