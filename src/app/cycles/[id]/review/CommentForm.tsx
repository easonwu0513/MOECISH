'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/Button';
import { Textarea } from '@/components/ui/Textarea';
import { useToast } from '@/components/ui/Toast';
import { Plus } from '@/components/icons';
import { onFlushReviewNotes } from './flush-review-notes';

export default function CommentForm({ responseId }: { responseId: string }) {
  const router = useRouter();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const [saving, setSaving] = useState(false);

  // 送出一則審閱筆記/委員意見。silent=由統一「儲存」鈕 flush 時,成功不逐則 toast、失敗改以 throw 讓彙整鈕統計。
  async function submit(opts?: { silent?: boolean }): Promise<void> {
    const body = text.trim();
    if (!body) return;
    setSaving(true);
    let res: Response;
    try {
      res = await fetch(`/api/responses/${responseId}/comments`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ content: body }),
      });
    } finally {
      setSaving(false);
    }
    if (!res.ok) {
      const j = await res.json().catch(() => ({ error: '新增失敗' }));
      if (opts?.silent) throw new Error(j.error ?? '新增失敗');
      toast.error('新增失敗', j.error);
      return;
    }
    if (!opts?.silent) toast.success('已送出委員意見');
    setText('');
    setOpen(false);
    router.refresh();
  }

  // 統一「儲存」鈕(批68 Q2):有正在輸入的草稿才 flush(靜默送出),否則跳過。
  const flushRef = useRef<() => Promise<void> | null>(() => null);
  flushRef.current = () => (open && text.trim() ? submit({ silent: true }) : null);
  useEffect(() => onFlushReviewNotes(() => flushRef.current()), []);

  if (!open) {
    return (
      <Button size="sm" variant="ghost" leadingIcon={<Plus size={14} />} onClick={() => setOpen(true)}>
        新增委員意見
      </Button>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <Textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={3}
        placeholder="委員意見…"
      />
      <div className="flex gap-2">
        <Button size="sm" loading={saving} onClick={() => submit()}>送出意見</Button>
        <Button size="sm" variant="ghost" onClick={() => { setOpen(false); setText(''); }}>取消</Button>
      </div>
    </div>
  );
}
