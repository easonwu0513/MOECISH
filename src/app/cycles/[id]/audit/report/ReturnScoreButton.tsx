'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { Textarea } from '@/components/ui/Textarea';
import { useToast } from '@/components/ui/Toast';

/**
 * 最高管理員「退件」:解除某委員已定稿的評分與發現,使其可重新編輯(會通知該委員)。
 */
export default function ReturnScoreButton({
  cycleId,
  auditorId,
  auditorName,
}: {
  cycleId: string;
  auditorId: string;
  auditorName: string;
}) {
  const router = useRouter();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit() {
    setBusy(true);
    const res = await fetch(`/api/cycles/${cycleId}/audit/return`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ auditorId, reason: reason.trim() || undefined }),
    });
    if (!res.ok) {
      const j = await res.json().catch(() => ({ error: '退件失敗' }));
      setBusy(false);
      toast.error('退件失敗', j.error);
      return;
    }
    const j = await res.json().catch(() => ({ notified: 0 }));
    setBusy(false);
    setOpen(false);
    setReason('');
    // 誠實反映通知是否送達:委員若已停用,notified=0,不可假性宣稱已通知
    if (j.notified > 0) {
      toast.success('已退件', `已解除 ${auditorName} 委員的鎖定,可重新編輯;已於系統內通知(不寄 email),請一併於現場告知委員。`);
    } else {
      toast.success('已退件', `已解除 ${auditorName} 委員的鎖定;惟站內通知未建立(委員可能已停用),請另行告知委員。`);
    }
    router.refresh();
  }

  return (
    <>
      <Button variant="text" size="sm" onClick={() => setOpen(true)}>退件</Button>
      <Dialog
        open={open}
        onOpenChange={(v) => !busy && setOpen(v)}
        title={`退件給 ${auditorName} 委員`}
        description="退件後該委員的評分與發現將解除鎖定、可重新編輯,並於系統內收到站內通知(不另寄 email,退件請於實地稽核現場一併告知委員)。"
        footer={
          <>
            <Button variant="text" onClick={() => setOpen(false)} disabled={busy}>取消</Button>
            <Button variant="warning" onClick={submit} loading={busy}>確認退件</Button>
          </>
        }
      >
        <Textarea
          label="退回原因(選填,將一併通知委員)"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          rows={3}
          placeholder="請說明需委員修正之處(選填)。"
        />
      </Dialog>
    </>
  );
}
