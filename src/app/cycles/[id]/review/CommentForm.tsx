'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function CommentForm({ responseId }: { responseId: string }) {
  const router = useRouter();
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
      alert('新增失敗');
      return;
    }
    setText('');
    setOpen(false);
    router.refresh();
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="mt-2 text-sm text-brand-600 hover:text-brand-700"
      >
        + 新增稽核委員意見
      </button>
    );
  }

  return (
    <div className="mt-3 space-y-2">
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={3}
        placeholder="委員意見…"
        className="w-full border rounded-md px-3 py-2 text-sm"
      />
      <div className="flex gap-2">
        <button
          onClick={submit}
          disabled={saving}
          className="px-3 py-1.5 bg-brand-600 hover:bg-brand-700 text-white text-sm rounded-md disabled:opacity-60"
        >
          {saving ? '送出中…' : '送出意見'}
        </button>
        <button
          onClick={() => { setOpen(false); setText(''); }}
          className="px-3 py-1.5 text-slate-600 text-sm"
        >
          取消
        </button>
      </div>
    </div>
  );
}
