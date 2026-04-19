'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ui/Dialog';
import { useToast } from '@/components/ui/Toast';

export default function NotifyButton({ cycleId }: { cycleId: string }) {
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  async function run() {
    setLoading(true);
    const res = await fetch(`/api/cycles/${cycleId}/notify`, { method: 'POST' });
    setLoading(false);
    if (!res.ok) {
      const j = await res.json().catch(() => ({ error: '通知失敗' }));
      toast.error('通知失敗', j.error);
      return;
    }
    const j = await res.json();
    toast.success('已寄送通知', `共 ${j.recipientCount} 位填報人 / 主管`);
    setOpen(false);
  }

  return (
    <>
      <Button variant="tonal" onClick={() => setOpen(true)}>
        通知填報人 / 主管
      </Button>
      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        title="寄送通知"
        description="系統將對該機關啟用中的所有填報人與主管寄送 email 通知開始填報。將記錄於 Email 紀錄供查核。"
        confirmLabel="寄送"
        onConfirm={run}
        loading={loading}
      />
    </>
  );
}
