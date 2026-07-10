'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ui/Dialog';
import { Megaphone } from '@/components/icons';
import { useTrackRemind } from '@/components/cycle/useTrackRemind';

/**
 * 中心「一鍵寄追蹤信」(admin/cycles 落後列 + dashboard 逾期矩陣列共用;大改造C 搬至共用層):對該落後週期之機關管理員寄出進度追蹤提醒,並在列上就地顯示催辦軌跡
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
  const remind = useTrackRemind();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  async function run() {
    setLoading(true);
    const ok = await remind(cycleId); // 共用 hook:fetch + 誠實 toast + router.refresh(軌跡即時更新)
    setLoading(false);
    if (ok) setOpen(false);
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
            <span className="mt-2 block">將記錄於 Email 紀錄與本週期催辦軌跡供查核。同一天重複點擊不會重複寄送。確定寄送？</span>
          </span>
        }
        confirmLabel="寄送提醒"
        onConfirm={run}
        loading={loading}
      />
    </div>
  );
}
