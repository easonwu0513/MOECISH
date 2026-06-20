'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { Textarea } from '@/components/ui/Textarea';
import { useToast } from '@/components/ui/Toast';

/**
 * 審閱頁底部收尾:委員逐題留意見後,於此明確「退回補正給機關」(接現有 checklist/reopen)。
 * 給審閱一個終點動作,不必回頭找頂端橫幅。
 */
export default function ReviewReopenBar({
  cycleId,
  openComments,
}: {
  cycleId: string;
  openComments: number;
}) {
  const router = useRouter();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);

  async function reopen() {
    if (!reason.trim()) {
      toast.error('請填寫退回原因', '機關會收到此說明,請具體指出需補正之處。');
      return;
    }
    setBusy(true);
    const res = await fetch(`/api/cycles/${cycleId}/checklist/reopen`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ reason }),
    });
    setBusy(false);
    if (!res.ok) {
      const j = await res.json().catch(() => ({ error: '操作失敗' }));
      toast.error('退回失敗', j.error);
      return;
    }
    setOpen(false);
    setReason('');
    toast.success('已退回補正', '機關管理員將收到通知信與退回原因。');
    router.refresh();
  }

  return (
    <>
      <div className="mt-8 rounded-md border border-outline-variant/60 bg-surface-container-lowest p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <p className="text-title-md text-on-surface">完成審閱</p>
          <p className="text-body-sm text-on-surface-variant mt-0.5">
            {openComments > 0
              ? `尚有 ${openComments} 題意見待機關補正;確認意見齊全後,可整批退回請機關修正。`
              : '逐題意見已留;如需機關修正可退回補正,否則維持送審即可。'}
          </p>
        </div>
        <Button variant="warning" onClick={() => setOpen(true)} className="shrink-0">
          退回補正給機關
        </Button>
      </div>
      <Dialog
        open={open}
        onOpenChange={(v) => !busy && setOpen(v)}
        title="退回補正給機關"
        description="退回後機關即可再次編輯,並會收到通知信與下方原因說明。"
        footer={
          <>
            <Button variant="text" onClick={() => setOpen(false)} disabled={busy}>取消</Button>
            <Button variant="warning" onClick={reopen} loading={busy}>確認退回</Button>
          </>
        }
      >
        <Textarea
          label="退回原因(必填,機關會看到)"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          rows={4}
          placeholder="例:3.2、5.1 說明與佐證不符,請補充執行紀錄;7.4 應檢附委外契約資安條款…"
        />
      </Dialog>
    </>
  );
}
