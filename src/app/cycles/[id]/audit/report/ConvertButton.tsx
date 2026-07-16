'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ui/Dialog';
import { useToast } from '@/components/ui/Toast';

/** 最高管理員:把彙整報告中尚未轉入的待改善/建議一鍵建立為缺失。 */
export default function ConvertButton({
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

  async function convert() {
    setBusy(true);
    const res = await fetch(`/api/cycles/${cycleId}/audit/convert`, { method: 'POST' });
    setBusy(false);
    setOpen(false);
    if (!res.ok) {
      const j = await res.json().catch(() => ({ error: '轉入失敗' }));
      toast.error('轉入失敗', j.error);
      return;
    }
    const j = await res.json();
    toast.success(`已轉入 ${j.converted} 條`, '可至「缺失與矯正管考」檢視並發布開放機關填報。');
    router.refresh();
  }

  if (pendingCount === 0) return null;

  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)}>
        轉入缺失管考（{pendingCount})
      </Button>
      <ConfirmDialog
        open={open}
        onOpenChange={(o) => !busy && setOpen(o)}
        title="轉入缺失管考"
        description={`將把 ${pendingCount} 條待改善與建議事項建立為本週期缺失（項次自動接續編號；法遵符合情形不轉）。已轉入的發現將鎖定、無法再編輯。確定執行？`}
        confirmLabel="確認轉入"
        tone="primary"
        onConfirm={convert}
        loading={busy}
      />
    </>
  );
}
