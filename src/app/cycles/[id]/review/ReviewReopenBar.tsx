'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { Textarea } from '@/components/ui/Textarea';
import { useToast } from '@/components/ui/Toast';

/**
 * 審閱頁收尾動作(角色化):
 * - 委員:逐題留意見後按「意見填寫完成」通知中心(可取消重開);不再自行退回重填。
 * - 中心:彙整委員意見後決定是否「退回重填」(原因選填,委員各題意見即補正依據)。
 */
export default function ReviewReopenBar({
  cycleId,
  role,
  openComments,
  reviewDone,
}: {
  cycleId: string;
  role: string;
  openComments: number;
  reviewDone: boolean;
}) {
  const router = useRouter();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);

  async function markDone(done: boolean) {
    setBusy(true);
    const res = await fetch(`/api/cycles/${cycleId}/review/done`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ done }),
    });
    setBusy(false);
    if (!res.ok) {
      const j = await res.json().catch(() => ({ error: '操作失敗' }));
      toast.error('操作失敗', j.error);
      return;
    }
    toast.success(done ? '已標記意見填寫完成' : '已取消完成標記', done ? '中心將收到通知。' : undefined);
    router.refresh();
  }

  async function reopen() {
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
    toast.success('已退回重填', '機關管理員將收到通知信。');
    router.refresh();
  }

  // 委員:意見填寫完成(可切換)
  if (role === 'AUDITOR') {
    return (
      <div className="mt-8 rounded-md border border-outline-variant/60 bg-surface-container-lowest p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <p className="text-title-md text-on-surface">{reviewDone ? '已標記:意見填寫完成' : '完成審閱'}</p>
          <p className="text-body-sm text-on-surface-variant mt-0.5">
            {reviewDone
              ? '中心已收到你完成審閱的通知。如需補充意見,可取消後再留言。'
              : openComments > 0
                ? `已留 ${openComments} 題意見。逐題意見留妥後,按「意見填寫完成」通知中心;中心將審視意見並決定是否退回重填。`
                : '逐題意見留妥後,按「意見填寫完成」通知中心;中心將審視意見並決定是否退回重填。'}
          </p>
        </div>
        {reviewDone ? (
          <Button variant="tonal" onClick={() => markDone(false)} loading={busy} className="shrink-0">取消完成標記</Button>
        ) : (
          <Button onClick={() => markDone(true)} loading={busy} className="shrink-0">意見填寫完成</Button>
        )}
      </div>
    );
  }

  // 中心:退回重填(原因選填)
  return (
    <>
      <div className="mt-8 rounded-md border border-outline-variant/60 bg-surface-container-lowest p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <p className="text-title-md text-on-surface">退回重填</p>
          <p className="text-body-sm text-on-surface-variant mt-0.5">
            彙整委員意見後,可退回請機關補正重填。退回原因會呈現給機關(機關看不到委員逐題意見),請於原因中載明需補正之處。
          </p>
        </div>
        <Button variant="warning" onClick={() => setOpen(true)} className="shrink-0">退回重填給機關</Button>
      </div>
      <Dialog
        open={open}
        onOpenChange={(v) => !busy && setOpen(v)}
        title="退回重填給機關"
        description="退回後機關即可再次編輯;機關僅會看到下方填寫的退回原因(看不到委員逐題意見),請於原因載明補正方向。"
        footer={
          <>
            <Button variant="text" onClick={() => setOpen(false)} disabled={busy}>取消</Button>
            <Button variant="warning" onClick={reopen} loading={busy}>確認退回</Button>
          </>
        }
      >
        <Textarea
          label="退回原因(機關會看到;留空將以系統預設說明通知機關)"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          rows={4}
          placeholder="請說明需要機關補正的事項或方向(機關僅能看到此退回原因,看不到委員逐題意見)。"
        />
      </Dialog>
    </>
  );
}
