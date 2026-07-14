'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { useToast } from '@/components/ui/Toast';
import { Check } from '@/components/icons';
import { FLUSH_REVIEW_NOTES_EVENT, type FlushReviewNotesDetail } from './flush-review-notes';

/**
 * 統一「儲存」鈕(批68 Q2):委員審閱頁逐題筆記/意見各自有送出鈕,委員怕漏存。
 * 本鈕廣播 window 事件,收集各筆記編輯元件回報的存檔 Promise,一次存下所有「正在輸入」的草稿,
 * 完成後彙整回報(成功/部分失敗/逾時)。僅 flush 筆記類 autosave 草稿;不代送任何顯式提交流程。
 */
export default function SaveAllReviewNotes() {
  const toast = useToast();
  const [busy, setBusy] = useState(false);

  async function saveAll() {
    if (busy) return;
    setBusy(true);
    try {
      const pending: Promise<void>[] = [];
      // dispatchEvent 同步執行所有 listener:各元件於此當下 collect 其存檔 Promise。
      const detail: FlushReviewNotesDetail = { collect: (p) => pending.push(p) };
      window.dispatchEvent(new CustomEvent(FLUSH_REVIEW_NOTES_EVENT, { detail }));

      if (pending.length === 0) {
        toast.success('已儲存全部審閱筆記', '目前沒有正在輸入、尚未存檔的內容。');
        return;
      }

      const TIMEOUT = 15000;
      let timer: ReturnType<typeof setTimeout> | undefined;
      const timeout = new Promise<'timeout'>((resolve) => {
        timer = setTimeout(() => resolve('timeout'), TIMEOUT);
      });
      const settled = await Promise.race([Promise.allSettled(pending), timeout]);
      if (timer) clearTimeout(timer);

      if (settled === 'timeout') {
        toast.error('儲存逾時', '部分筆記可能尚未存檔，請稍後再試一次。');
        return;
      }
      const failed = settled.filter((r) => r.status === 'rejected').length;
      if (failed > 0) {
        toast.error('部分筆記儲存失敗', `${failed} 則未存檔，請檢查後重試。`);
      } else {
        toast.success('已儲存全部審閱筆記');
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <Button size="sm" variant="tonal" loading={busy} leadingIcon={<Check size={15} />} onClick={saveAll}>
      儲存
    </Button>
  );
}
