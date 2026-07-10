'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ui/Dialog';
import { useToast } from '@/components/ui/Toast';

/** 邀請列操作:重寄(效期展延 14 天;過期邀請亦可)/ 撤銷(僅待接受)。 */
export default function InviteRowActions({ inviteId, email, canRevoke = true }: { inviteId: string; email: string; canRevoke?: boolean }) {
  const router = useRouter();
  const toast = useToast();
  const [revokeOpen, setRevokeOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  async function resend() {
    setBusy(true);
    const res = await fetch(`/api/admin/invitations/${inviteId}`, { method: 'POST' });
    setBusy(false);
    if (!res.ok) {
      const j = await res.json().catch(() => ({ error: '重寄失敗' }));
      toast.error('重寄失敗', j.error);
      return;
    }
    toast.success('邀請信已重寄', `${email}；效期重新展延 14 天`);
    router.refresh();
  }

  async function revoke() {
    setBusy(true);
    const res = await fetch(`/api/admin/invitations/${inviteId}`, { method: 'DELETE' });
    setBusy(false);
    if (!res.ok) {
      const j = await res.json().catch(() => ({ error: '撤銷失敗' }));
      toast.error('撤銷失敗', j.error);
      return;
    }
    toast.success('已撤銷邀請', email);
    setRevokeOpen(false);
    router.refresh();
  }

  return (
    <>
      <div className="flex items-center justify-end gap-1">
        <Button size="sm" variant="text" onClick={resend} disabled={busy}>
          重寄
        </Button>
        {canRevoke && (
          <Button size="sm" variant="text" className="text-danger-600" onClick={() => setRevokeOpen(true)}>
            撤銷
          </Button>
        )}
      </div>
      <ConfirmDialog
        open={revokeOpen}
        onOpenChange={(o) => !busy && setRevokeOpen(o)}
        title="撤銷邀請"
        description={`撤銷後「${email}」的邀請連結立即失效；之後可重新建立邀請。`}
        confirmLabel="撤銷"
        tone="danger"
        onConfirm={revoke}
        loading={busy}
      />
    </>
  );
}
