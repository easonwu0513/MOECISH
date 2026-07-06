'use client';

import { useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useToast } from '@/components/ui/Toast';

/**
 * 中心「寄追蹤信」共用邏輯(單一來源):POST /api/cycles/[id]/track-remind → 依回應誠實 toast
 * (已寄 / 24h 去重「今日已提醒過」)→ router.refresh 更新催辦軌跡。
 * 原本在 RemindButton 與 AppShell(⌘K)兩處手抄且文案已開始漂移(五鏡稽核),收斂於此。
 * 回傳 boolean:是否成功(供呼叫端決定是否關閉對話框等)。
 */
export function useTrackRemind() {
  const router = useRouter();
  const toast = useToast();
  return useCallback(async function remind(cycleId: string): Promise<boolean> {
    const res = await fetch(`/api/cycles/${cycleId}/track-remind`, { method: 'POST' });
    if (!res.ok) {
      const j = await res.json().catch(() => ({ error: '催辦失敗' }));
      toast.error('催辦失敗', j.error);
      return false;
    }
    const j = await res.json();
    if (j.sentCount === 0 && j.skippedCount > 0) {
      toast.info('今日已提醒過', `${j.skippedCount} 位機關管理員今日已收到提醒,未重複寄送`);
    } else {
      const extra = j.skippedCount > 0 ? ` · ${j.skippedCount} 位今日已提醒過` : '';
      toast.success('已寄送追蹤提醒', `已通知 ${j.sentCount} 位機關管理員${extra} · 本週期累計催辦 ${j.remindCount} 封`);
    }
    router.refresh();
    return true;
  }, [router, toast]);
}
