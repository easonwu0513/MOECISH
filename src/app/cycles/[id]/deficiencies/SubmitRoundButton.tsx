'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ui/Dialog';
import { useToast } from '@/components/ui/Toast';

/**
 * 一輪統一送出審核(批50):機關把已填寫完整的矯正措施一次送審,每位委員只收一封彙整信。
 * count = 目前草稿/退回補正中(可送候選)的項數;為 0 時不顯示。
 */
export default function SubmitRoundButton({ cycleId, count }: { cycleId: string; count: number }) {
  const router = useRouter();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  async function submit() {
    setBusy(true);
    const res = await fetch(`/api/cycles/${cycleId}/deficiencies/submit-round`, { method: 'POST' });
    const j = (await res.json().catch(() => ({}))) as {
      error?: string;
      submitted?: number;
      notified?: number;
      skipped?: { itemNo: number; label: string; missing: string[] }[];
    };
    setBusy(false);
    setOpen(false);
    if (!res.ok) {
      toast.error('尚無法送出', j.error || '送出失敗');
      return;
    }
    const skipped = j.skipped ?? [];
    if (skipped.length > 0) {
      const names = skipped.slice(0, 3).map((s) => s.label).join('、');
      toast.success(
        '本輪已送出審核',
        `已送審 ${j.submitted} 項；另有 ${skipped.length} 項未填完整而略過（${names}${skipped.length > 3 ? '…' : ''}），請補齊後再送出。`,
      );
    } else {
      toast.success(
        '本輪已送出審核',
        `已送審 ${j.submitted} 項，已通知委員進行審核。`,
      );
    }
    router.refresh();
  }

  if (count === 0) return null;
  return (
    <>
      <Button variant="filled" size="sm" onClick={() => setOpen(true)}>
        送出本輪審核（{count}）
      </Button>
      <ConfirmDialog
        open={open}
        onOpenChange={(o) => !busy && setOpen(o)}
        title="送出本輪審核"
        description={`將把這 ${count} 項已填寫完整的矯正措施一次送出審核。確定送出？`}
        confirmLabel="送出審核"
        tone="primary"
        onConfirm={submit}
        loading={busy}
      />
    </>
  );
}
