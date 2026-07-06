'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ui/Dialog';
import { useToast } from '@/components/ui/Toast';
import { Megaphone } from '@/components/icons';

/**
 * 中心「通知機關」按鈕(開立中 / 資料準備中):寄出「貴機關今年度將接受稽核 + 已確定時程」之作業通知。
 * 與缺失發布後的 NotifyButton 不同——置於日期設定旁,中心確認時程後再正式通知,避免日期未定就發。
 */
export default function NotifyOrgButton({
  cycleId,
  orgName,
  datesConfirmed,
}: {
  cycleId: string;
  orgName: string;
  /** 是否已設定實地稽核日(時程已確定)。未確定前不開放寄送,避免寄出無時程的通知擾民。 */
  datesConfirmed: boolean;
}) {
  const router = useRouter();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  async function run() {
    setLoading(true);
    const res = await fetch(`/api/cycles/${cycleId}/notify-open`, { method: 'POST' });
    setLoading(false);
    if (!res.ok) {
      const j = await res.json().catch(() => ({ error: '通知失敗' }));
      toast.error('通知失敗', j.error);
      return;
    }
    const j = await res.json();
    toast.success('已寄送稽核作業通知', `共 ${j.recipientCount} 位填報人 / 主管`);
    setOpen(false);
    // 待辦卡「通知機關填報人/主管」的自動打勾(orgNotified fact)是 server 端算的:
    // 不 refresh 的話畫面停在舊資料,使用者以為沒生效(UAT 批71 圖1 根因)
    router.refresh();
  }

  return (
    <>
      {/* 未設實地稽核日前鎖定:時程未確定不開放寄信(避免寄出無時程通知被視為擾民) */}
      <span title={datesConfirmed ? undefined : '請先於「編輯日期」設定實地稽核日,確定時程後才能通知機關'}>
        <Button
          size="sm"
          variant="text"
          leadingIcon={<Megaphone size={14} />}
          onClick={() => setOpen(true)}
          disabled={!datesConfirmed}
        >
          通知機關(稽核開立)
        </Button>
      </span>
      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        title="通知機關填報人 / 主管"
        description={
          <span className="block leading-relaxed">
            將以 email 通知「{orgName}」的機關管理員:貴機關今年度將接受資通安全稽核,並附上已設定的重要時程(技術檢測日 / 實地稽核日 / 各區資料繳交截止 / 矯正填報截止)。
            <span className="mt-2 block">將記錄於 Email 紀錄供查核。確定寄送?</span>
          </span>
        }
        confirmLabel="寄送通知"
        onConfirm={run}
        loading={loading}
      />
    </>
  );
}
