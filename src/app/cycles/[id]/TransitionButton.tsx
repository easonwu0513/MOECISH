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
  disabled = false,
  disabledHint,
  warn,
}: {
  cycleId: string;
  target: CycleStatus;
  rollback?: boolean;
  /** 前置條件未滿足時鎖定按鈕並顯示原因(後端 transition API 為權威閘,此為 UX 提示層) */
  disabled?: boolean;
  disabledHint?: string;
  /** 前進推進的「軟性提醒」(UAT 批68):非阻擋,確認框顯警示、委員/中心可確認後仍推進(如未設矯正截止日) */
  warn?: string;
}) {
  const router = useRouter();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [loading, setLoading] = useState(false);

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
    // 進入資料齊備:轉換 API 已自動寄信並於站內通知受指派委員開始審閱(委員此時起可檢視機關資料)
    if (!rollback && target === 'READY') {
      toast.info('已通知委員審閱', '系統已自動寄信並於站內通知受指派委員,委員現在起可檢視機關檢核表與已齊備之資料');
    }
  }

  if (rollback) {
    return (
      <>
        <Button
          variant="text"
          size="sm"
          onClick={() => { setReason(''); setOpen(true); }}
          leadingIcon={<ChevronLeft size={14} />}
          className="text-ink-500"
        >
          回退至{CYCLE_STATUS_LABELS[target]}
        </Button>
        <ConfirmDialog
          open={open}
          onOpenChange={(o) => !loading && setOpen(o)}
          title="回退週期狀態"
          description={
            <div className="mt-2 flex flex-col gap-3">
              <p className="text-body-sm text-ink-500">
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

  if (disabled) {
    // 行內排版(與同列其他按鈕垂直置中對齊);原因以文字直接顯示,不藏在 tooltip
    return (
      <span className="inline-flex items-center gap-2" title={disabledHint}>
        <Button variant="filled" size="sm" disabled trailingIcon={<ChevronRight size={14} />}>
          {CYCLE_STATUS_LABELS[target]}
        </Button>
        {disabledHint && <span className="text-caption text-ink-500">{disabledHint}</span>}
      </span>
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
        title={warn ? '尚未設定矯正截止日期,仍要推進?' : '確認狀態轉換'}
        description={
          warn ? (
            <div className="mt-2 flex flex-col gap-3">
              <div className="rounded-md border border-warning-200 bg-warning-50 px-3.5 py-3 text-body-sm text-warning-800">
                <p className="font-medium">矯正截止日尚未設定</p>
                <p className="mt-1 text-caption text-warning-700 leading-relaxed">{warn}</p>
              </div>
              <p className="text-body-sm text-ink-500">確定要將稽核週期狀態推進至「{CYCLE_STATUS_LABELS[target]}」?</p>
            </div>
          ) : (
            `確定要將稽核週期狀態推進至「${CYCLE_STATUS_LABELS[target]}」？`
          )
        }
        confirmLabel={warn ? '仍要推進' : '確定推進'}
        onConfirm={run}
        loading={loading}
      />
    </>
  );
}
