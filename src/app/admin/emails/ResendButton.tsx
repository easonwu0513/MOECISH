'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/Button';
import { useToast } from '@/components/ui/Toast';

export default function ResendButton({ logId }: { logId: string }) {
  const router = useRouter();
  const toast = useToast();
  const [busy, setBusy] = useState(false);

  async function resend() {
    setBusy(true);
    const res = await fetch(`/api/admin/emails/${logId}/resend`, { method: 'POST' });
    setBusy(false);
    if (!res.ok) {
      const j = await res.json().catch(() => ({ error: '重寄失敗' }));
      toast.error('重寄失敗', j.error);
      return;
    }
    const j = await res.json();
    if (j.delivery === 'sent') toast.success('已重寄成功');
    else if (j.delivery === 'failed') toast.error('重寄仍失敗', '請檢查收件地址或 Graph 連線後再試。');
    else toast.success('已重寄（模擬模式記錄）');
    router.refresh();
  }

  return (
    <Button size="sm" variant="text" onClick={resend} loading={busy}>
      重寄
    </Button>
  );
}
