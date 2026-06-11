'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { Textarea } from '@/components/ui/Textarea';
import { useToast } from '@/components/ui/Toast';
import { CheckCircle, AlertTriangle } from '@/components/icons';

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
}: {
  cycleId: string;
  submittedAtISO: string | null;
  submittedBy: string | null;
  reopenNote: string | null;
  canReopen: boolean;
}) {
  const router = useRouter();
  const toast = useToast();
  const [reopenOpen, setReopenOpen] = useState(false);
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
    setReopenOpen(false);
    setReason('');
    toast.success('已退回重填', '機關管理員將收到通知信與退回原因。');
    router.refresh();
  }

  if (submittedAtISO) {
    const when = new Date(submittedAtISO).toLocaleString('zh-TW', {
      year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
    });
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
              {canReopen ? ';如需機關補正,可退回重填。' : ';如需修改請洽稽核委員退回。'}
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
            label="退回原因(必填,機關會看到)"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={4}
            placeholder="例:3.2、5.1 簡述內容與佐證不符,請補充執行紀錄;7.4 應檢附委外契約資安條款…"
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
        <div className="min-w-0">
          <div className="text-title text-warning-700">填報被退回,請補正後重新送出</div>
          <p className="text-body-sm text-warning-600 mt-1 whitespace-pre-wrap">{reopenNote}</p>
        </div>
      </div>
    );
  }

  return null;
}
