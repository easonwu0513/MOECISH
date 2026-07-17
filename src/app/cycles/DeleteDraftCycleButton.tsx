'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ConfirmDialog } from '@/components/ui/Dialog';
import { useToast } from '@/components/ui/Toast';
import { Trash2 } from '@/components/icons';

/**
 * 刪除「開立中(DRAFT)」週期按鈕(UAT 圖11;僅中心視角、僅 DRAFT 卡片顯示)。
 * 卡片整體是 Link——此元件攔截內部所有點擊(preventDefault/stopPropagation),避免觸發導航。
 */
export function DeleteDraftCycleButton({ cycleId, orgName }: { cycleId: string; orgName: string }) {
  const router = useRouter();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  return (
    <span
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
      }}
    >
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1 text-caption text-danger-600 hover:underline focus-ring rounded"
      >
        <Trash2 size={13} /> 刪除週期
      </button>
      <ConfirmDialog
        open={open}
        onOpenChange={(o) => { if (!busy) setOpen(o); }}
        title="刪除開立中週期"
        description={`確定刪除「${orgName}」的本年度週期？僅「開立中」可刪；週期內既有設定將一併移除，此動作無法復原。`}
        confirmLabel="刪除"
        tone="danger"
        onConfirm={async () => {
          setBusy(true);
          const res = await fetch(`/api/admin/cycles/${cycleId}`, { method: 'DELETE' });
          setBusy(false);
          if (!res.ok) {
            const j = await res.json().catch(() => ({ error: '刪除失敗' }));
            toast.error('刪除失敗', j.error);
            return;
          }
          toast.success('已刪除週期', orgName);
          setOpen(false);
          router.refresh();
        }}
      />
    </span>
  );
}
