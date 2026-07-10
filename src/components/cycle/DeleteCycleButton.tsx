'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ui/Dialog';
import { useToast } from '@/components/ui/Toast';

/**
 * 刪除稽核週期(僅開立中 DRAFT;建錯醫院/年度時使用)。
 * 後端限 SUPER_ADMIN + DRAFT;此鈕只在符合條件的頁面渲染。
 */
export default function DeleteCycleButton({
  cycleId,
  orgName,
  yearROC,
  redirectTo,
}: {
  cycleId: string;
  orgName: string;
  yearROC: number;
  /** 刪除成功後導向(如 /admin/cycles);不給則原頁 refresh(用於清單內刪除) */
  redirectTo?: string;
}) {
  const router = useRouter();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  async function doDelete() {
    setBusy(true);
    const res = await fetch(`/api/cycles/${cycleId}`, { method: 'DELETE' }).catch(() => null);
    setBusy(false);
    setOpen(false);
    if (!res || !res.ok) {
      const j = res ? await res.json().catch(() => ({})) : {};
      toast.error('刪除失敗', (j as { error?: string }).error ?? '連線逾時,請稍後再試');
      return;
    }
    toast.success('已刪除稽核週期', `${orgName} ${yearROC} 年度`);
    if (redirectTo) router.push(redirectTo);
    else router.refresh();
  }

  return (
    <>
      <Button size="sm" variant="text" className="text-danger-600" onClick={() => setOpen(true)}>
        刪除週期
      </Button>
      <ConfirmDialog
        open={open}
        onOpenChange={(o) => !busy && setOpen(o)}
        title="刪除稽核週期"
        description={`將永久刪除「${orgName} ${yearROC} 年度」稽核週期,及其資料需求清單、委員指派與精靈進度等關聯資料。僅供建錯週期時使用,刪除後無法復原。確定要刪除嗎？`}
        confirmLabel="永久刪除"
        tone="danger"
        onConfirm={doDelete}
        loading={busy}
      />
    </>
  );
}
