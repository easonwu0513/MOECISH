'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ui/Dialog';
import { Textarea } from '@/components/ui/Textarea';
import { useToast } from '@/components/ui/Toast';
import { CYCLE_STATUS_LABELS } from '@/lib/state-machine';
import type { CycleStatus } from '@/lib/types';
import { ChevronRight, ChevronLeft } from '@/components/icons';
import { TOAST } from '@/lib/copy';

/**
 * 週期狀態轉換按鈕。
 * rollback 模式:tonal 樣式 + 必填理由(誤按救回,理由記入稽核軌跡)。
 */
export default function TransitionButton({
  cycleId,
  target,
  rollback = false,
}: {
  cycleId: string;
  target: CycleStatus;
  rollback?: boolean;
}) {
  const router = useRouter();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [loading, setLoading] = useState(false);
  // 推進至「資料齊備(READY)」後跳出提示,讓中心一鍵寄信通知委員開始審閱(委員此時才看得到機關資料)
  const [notifyOpen, setNotifyOpen] = useState(false);
  const [notifyLoading, setNotifyLoading] = useState(false);

  async function run() {
    if (rollback && reason.trim().length < 5) {
      toast.error('請填寫回退理由', '至少 5 個字,將記入稽核軌跡');
      return;
    }
    setLoading(true);
    const res = await fetch(`/api/cycles/${cycleId}/transition`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ target, reason: rollback ? reason.trim() : undefined }),
    });
    setLoading(false);
    if (!res.ok) {
      const j = await res.json().catch(() => ({ error: '轉換失敗' }));
      toast.error('狀態轉換失敗', j.error);
      return;
    }
    const t = TOAST.transitioned(CYCLE_STATUS_LABELS[target]);
    toast.success(rollback ? '已回退狀態' : t.title, rollback ? `週期已回退至「${CYCLE_STATUS_LABELS[target]}」` : t.description);
    setOpen(false);
    setReason('');
    router.refresh();
    // 進入資料齊備:委員此時起可檢視機關資料 → 提示中心同步寄信通知委員審閱
    if (!rollback && target === 'READY') setNotifyOpen(true);
  }

  async function notifyCommittee() {
    setNotifyLoading(true);
    const res = await fetch(`/api/cycles/${cycleId}/notify-review`, { method: 'POST' });
    setNotifyLoading(false);
    setNotifyOpen(false);
    if (!res.ok) {
      const j = await res.json().catch(() => ({ error: '通知失敗' }));
      toast.error('通知委員失敗', j.error);
      return;
    }
    const j = await res.json().catch(() => ({ recipientCount: 0 }));
    toast.success('已通知委員審閱', j.recipientCount ? `共 ${j.recipientCount} 位受指派委員` : '目前尚無受指派委員');
  }

  if (rollback) {
    return (
      <>
        <Button
          variant="text"
          size="sm"
          onClick={() => { setReason(''); setOpen(true); }}
          leadingIcon={<ChevronLeft size={14} />}
          className="text-on-surface-variant"
        >
          回退至{CYCLE_STATUS_LABELS[target]}
        </Button>
        <ConfirmDialog
          open={open}
          onOpenChange={(o) => !loading && setOpen(o)}
          title="回退週期狀態"
          description={
            <div className="mt-2 flex flex-col gap-3">
              <p className="text-body-sm text-on-surface-variant">
                將狀態回退至「{CYCLE_STATUS_LABELS[target]}」。回退不會刪除任何已填資料,
                但機關與委員看到的階段會跟著改變。理由將記入稽核軌跡。
              </p>
              <Textarea
                label="回退理由(必填,至少 5 字)"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                rows={2}
                placeholder="例:誤按推進,實地稽核尚未完成"
              />
            </div>
          }
          confirmLabel="確定回退"
          tone="danger"
          onConfirm={run}
          loading={loading}
        />
      </>
    );
  }

  return (
    <>
      <Button
        variant="filled"
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
      {/* 進入資料齊備後的後續提示:寄信通知委員開始審閱 */}
      <ConfirmDialog
        open={notifyOpen}
        onOpenChange={(o) => !notifyLoading && setNotifyOpen(o)}
        title="通知委員開始審閱?"
        description="週期已進入「資料齊備」,受指派委員現在起可檢視機關檢核表與已確認齊備之資料。是否立即寄信通知委員開始審閱?(稍後仍可於缺失/實地稽核等流程另行聯繫)"
        confirmLabel="寄信通知委員"
        cancelLabel="稍後再說"
        tone="primary"
        onConfirm={notifyCommittee}
        loading={notifyLoading}
      />
    </>
  );
}
