'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ui/Dialog';
import { useToast } from '@/components/ui/Toast';
import { CYCLE_STATUS_LABELS } from '@/lib/state-machine';
import type { CycleStatus } from '@/lib/types';
import { ChevronRight } from '@/components/icons';
import { TOAST } from '@/lib/copy';

export default function TransitionButton({
  cycleId,
  target,
}: {
  cycleId: string;
  target: CycleStatus;
}) {
  const router = useRouter();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  async function run() {
    setLoading(true);
    const res = await fetch(`/api/cycles/${cycleId}/transition`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ target }),
    });
    setLoading(false);
    if (!res.ok) {
      const j = await res.json().catch(() => ({ error: '轉換失敗' }));
      toast.error('狀態轉換失敗', j.error);
      return;
    }
    const t = TOAST.transitioned(CYCLE_STATUS_LABELS[target]);
    toast.success(t.title, t.description);
    setOpen(false);
    router.refresh();
  }

  return (
    <>
      <Button
        variant="primary"
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
