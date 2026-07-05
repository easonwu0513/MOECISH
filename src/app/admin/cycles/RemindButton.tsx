'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ui/Dialog';
import { useToast } from '@/components/ui/Toast';
import { Megaphone } from '@/components/icons';

/**
 * 中心落後列「一鍵寄追蹤信」:對該落後週期之機關管理員寄出進度追蹤提醒,並在列上就地顯示催辦軌跡
 * (上次催辦日期 / 累計封數)。寄送後 router.refresh() 讓軌跡即時更新(閉環)。
 */
export default function RemindButton({
  cycleId,
  orgName,
  yearLabel,
  lastLabel,
  remindCount,
}: {
  cycleId: string;
  orgName: string;
  /** 民國年度字串(如「114」)。 */
  yearLabel: string;
  /** 上次催辦日期(民國)字串;尚未催辦則為 null。 */
  lastLabel: string | null;
  /** 此週期累計已寄出之追蹤信封數。 */
  remindCount: number;
}) {
  const router = useRouter();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  async function run() {
    setLoading(true);
    const res = await fetch(`/api/cycles/${cycleId}/track-remind`, { method: 'POST' });
    setLoading(false);
    if (!res.ok) {
      const j = await res.json().catch(() => ({ error: '催辦失敗' }));
      toast.error('催辦失敗', j.error);
      return;
    }
    const j = await res.json();
    if (j.sentCount === 0 && j.skippedCount > 0) {
      // 24h 內已提醒過,sendEmail 去重未重複寄送 — 誠實告知而非謊稱已寄
      toast.info('今日已提醒過', `${j.skippedCount} 位機關管理員今日已收到提醒,未重複寄送`);
    } else {
      const extra = j.skippedCount > 0 ? ` · ${j.skippedCount} 位今日已提醒過` : '';
      toast.success('已寄送追蹤提醒', `已通知 ${j.sentCount} 位機關管理員${extra} · 本週期累計催辦 ${j.remindCount} 封`);
    }
    setOpen(false);
    // 催辦軌跡(上次催辦 / 累計封數)是 server 端查 EmailLog 算的:refresh 讓列上軌跡即時更新
    router.refresh();
  }

  return (
    <div className="inline-flex flex-col items-end gap-1">
      <Button
        size="sm"
        variant="tonal"
        leadingIcon={<Megaphone size={14} />}
        onClick={() => setOpen(true)}
      >
        寄追蹤信
      </Button>
      <span className="text-caption text-ink-500 tabular-nums leading-tight">
        {lastLabel ? `上次催辦 ${lastLabel}` : '尚未催辦'}
        {remindCount > 0 && <span> · 累計 {remindCount} 封</span>}
      </span>
      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        title="寄送進度追蹤提醒"
        description={
          <span className="block leading-relaxed">
            將以 email 通知「{orgName}」{yearLabel} 年度的機關管理員:本年度稽核仍有待辦事項,並附上依目前階段的辦理焦點與直達連結。
            <span className="mt-2 block">將記錄於 Email 紀錄與本週期催辦軌跡供查核。同一天重複點擊不會重複寄送。確定寄送?</span>
          </span>
        }
        confirmLabel="寄送提醒"
        onConfirm={run}
        loading={loading}
      />
    </div>
  );
}
