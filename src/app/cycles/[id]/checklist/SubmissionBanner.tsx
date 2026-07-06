'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { Textarea } from '@/components/ui/Textarea';
import { useToast } from '@/components/ui/Toast';
import { CheckCircle, AlertTriangle } from '@/components/icons';
import { fmtROCDateTime } from '@/lib/date';

/**
 * 檢核表送出狀態橫幅(填報頁與委員審閱頁共用):
 * - 已送出:綠色橫幅(時間+送出者);具退回權限者(委員/最高管理員)顯示「退回重填」
 * - 被退回:琥珀橫幅顯示退回原因(機關視角,直到重新送出)
 */
export default function SubmissionBanner({
  cycleId,
  submittedAtISO,
  submittedBy,
  reopenNote,
  canReopen,
  hideModifyHint,
}: {
  cycleId: string;
  submittedAtISO: string | null;
  submittedBy: string | null;
  reopenNote: string | null;
  canReopen: boolean;
  /** 委員審閱頁:隱藏「如需修改請洽中心退回」等機關向文案(委員只是檢視,不涉修改)。 */
  hideModifyHint?: boolean;
}) {
  const router = useRouter();
  const toast = useToast();
  const [reopenOpen, setReopenOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);

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
    setReopenOpen(false);
    setReason('');
    toast.success('已退回重填', '機關管理員將收到通知信與退回原因。');
    router.refresh();
  }

  if (submittedAtISO) {
    const when = fmtROCDateTime(submittedAtISO);
    return (
      <>
        <div
          role="status"
          className="mb-5 flex flex-wrap items-center gap-3 rounded-md border border-success-200 bg-success-50 px-5 py-3.5"
        >
          <CheckCircle size={20} className="text-success-700 shrink-0" />
          <div className="flex-1 min-w-0">
            <div className="text-title text-success-700">填報已完成送出</div>
            <div className="text-body-sm text-success-600 mt-0.5">
              {submittedBy ? `由 ${submittedBy} ` : ''}於 {when} 送出,內容已鎖定
              {hideModifyHint ? '。' : canReopen ? ';如需請機關補正,可點「退回重填」。' : ';如需修改請洽中心退回。'}
            </div>
          </div>
          {canReopen && (
            <Button variant="tonal" size="sm" onClick={() => setReopenOpen(true)}>
              退回重填
            </Button>
          )}
        </div>
        <Dialog
          open={reopenOpen}
          onOpenChange={(v) => !busy && setReopenOpen(v)}
          title="退回檢核表重填"
          description="退回後機關即可再次編輯,並會收到通知信與下方原因說明。"
          footer={
            <>
              <Button variant="text" onClick={() => setReopenOpen(false)} disabled={busy}>取消</Button>
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

  if (reopenNote) {
    return (
      <div
        role="alert"
        className="mb-5 flex items-start gap-3 rounded-md border border-warning-200 bg-warning-50 px-5 py-3.5"
      >
        <AlertTriangle size={20} className="text-warning-700 shrink-0 mt-0.5" />
        {/* 四級平滑遞降(批86):標題(warning 重)→ 退回原因(近中性 body,讀得清、非全黃染)→ 行動提示(caption)。
            原本標題與正文皆 warning-700/600=兩級斷崖且整段黃染難讀。 */}
        <div className="min-w-0">
          <div className="text-title-md text-warning-800">填報被退回,請補正後重新送出</div>
          <p className="mt-1.5 text-body text-ink-900 whitespace-pre-wrap leading-relaxed">{reopenNote}</p>
          <p className="mt-1.5 text-caption text-ink-500">補正後於下方重新送出。</p>
        </div>
      </div>
    );
  }

  return null;
}
