'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/Button';
import { Textarea } from '@/components/ui/Textarea';
import { useToast } from '@/components/ui/Toast';
import { Plus } from '@/components/icons';

export default function CommentForm({ responseId }: { responseId: string }) {
  const router = useRouter();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const [saving, setSaving] = useState(false);

  async function submit() {
    if (!text.trim()) return;
    setSaving(true);
    const res = await fetch(`/api/responses/${responseId}/comments`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ content: text }),
    });
    setSaving(false);
    if (!res.ok) {
      const j = await res.json().catch(() => ({ error: '新增失敗' }));
      toast.error('新增失敗', j.error);
      return;
    }
    toast.success('已送出委員意見');
    setText('');
    setOpen(false);
    router.refresh();
  }

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
        <Button size="sm" loading={saving} onClick={submit}>送出意見</Button>
        <Button size="sm" variant="ghost" onClick={() => { setOpen(false); setText(''); }}>取消</Button>
      </div>
    </div>
  );
}
