'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ui/Dialog';
import { Textarea } from '@/components/ui/Textarea';
import { useToast } from '@/components/ui/Toast';
import { CYCLE_STATUS_LABELS } from '@/lib/state-machine';
import type { CycleStatus } from '@/lib/types';
import { ChevronRight, ChevronLeft } from '@/components/icons';
import { TOAST } from '@/lib/copy';

/**
 * 週期狀態轉換按鈕。
 * rollback 模式:tonal 樣式 + 必填理由(誤按救回,理由記入稽核軌跡)。
 */
export default function TransitionButton({
  cycleId,
  target,
  rollback = false,
}: {
  cycleId: string;
  target: CycleStatus;
  rollback?: boolean;
}) {
  const router = useRouter();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [loading, setLoading] = useState(false);

  async function run() {
    if (rollback && reason.trim().length < 5) {
      toast.error('請填寫回退理由', '至少 5 個字,將記入稽核軌跡');
      return;
    }
    setLoading(true);
    const res = await fetch(`/api/cycles/${cycleId}/transition`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ target, reason: rollback ? reason.trim() : undefined }),
    });
    setLoading(false);
    if (!res.ok) {
      const j = await res.json().catch(() => ({ error: '轉換失敗' }));
      toast.error('狀態轉換失敗', j.error);
      return;
    }
    const t = TOAST.transitioned(CYCLE_STATUS_LABELS[target]);
    toast.success(rollback ? '已回退狀態' : t.title, rollback ? `週期已回退至「${CYCLE_STATUS_LABELS[target]}」` : t.description);
    setOpen(false);
    setReason('');
    router.refresh();
  }

  if (rollback) {
    return (
      <>
        <Button
          variant="text"
          size="sm"
          onClick={() => { setReason(''); setOpen(true); }}
          leadingIcon={<ChevronLeft size={14} />}
          className="text-on-surface-variant"
        >
          回退至{CYCLE_STATUS_LABELS[target]}
        </Button>
        <ConfirmDialog
          open={open}
          onOpenChange={(o) => !loading && setOpen(o)}
          title="回退週期狀態"
          description={
            <div className="mt-2 flex flex-col gap-3">
              <p className="text-body-sm text-on-surface-variant">
                將狀態回退至「{CYCLE_STATUS_LABELS[target]}」。回退不會刪除任何已填資料,
                但機關與委員看到的階段會跟著改變。理由將記入稽核軌跡。
              </p>
              <Textarea
                label="回退理由(必填,至少 5 字)"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                rows={2}
                placeholder="例:誤按推進,實地稽核尚未完成"
              />
            </div>
          }
          confirmLabel="確定回退"
          tone="danger"
          onConfirm={run}
          loading={loading}
        />
      </>
    );
  }

  return (
    <>
      <Button
        variant="filled"
        size="sm"
        onClick={() => setOpen(true)}
        trailingIcon={<ChevronRight size={14} />}
      >
        {CYCLE_STATUS_LABELS[target]}
      </Button>
      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        title="確認狀態轉換"
        description={`確定要將稽核週期狀態推進至「${CYCLE_STATUS_LABELS[target]}」？`}
        confirmLabel="確定推進"
        onConfirm={run}
        loading={loading}
      />
    </>
  );
}
