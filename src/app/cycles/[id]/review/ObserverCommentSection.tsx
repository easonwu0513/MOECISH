'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/Button';
import { Textarea } from '@/components/ui/Textarea';
import { useToast } from '@/components/ui/Toast';
import { ConfirmDialog } from '@/components/ui/Dialog';
import { NoteBox } from '@/components/cycle/NoteBox';
import { Plus } from '@/components/icons';
import { onFlushReviewNotes } from './flush-review-notes';
import { CommentWorkbench } from './CommentWorkbench';

type ObserverComment = { id: string; content: string; timeLabel: string };

/**
 * 觀察員意見(批42):檢核表逐題練習意見,操作比照委員意見(新增/修正/刪除自己的)。
 * 存獨立 PracticeComment 表——僅觀察員本人、其指導者與中心可見;機關與委員完全不可見。
 */
export default function ObserverCommentSection({
  responseId,
  comments,
  auditBasis,
}: {
  responseId: string;
  comments: ObserverComment[];
  auditBasis: string | null;
}) {
  const router = useRouter();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState('');
  const [deleting, setDeleting] = useState<ObserverComment | null>(null);
  const [busy, setBusy] = useState(false);

  async function create(opts?: { silent?: boolean }): Promise<void> {
    const body = text.trim();
    if (!body) return;
    setBusy(true);
    let res: Response;
    try {
      res = await fetch(`/api/responses/${responseId}/practice-comments`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ content: body }),
      });
    } finally {
      setBusy(false);
    }
    if (!res.ok) {
      const j = await res.json().catch(() => ({ error: '新增失敗' }));
      if (opts?.silent) throw new Error(j.error ?? '新增失敗');
      toast.error('新增失敗', j.error);
      return;
    }
    if (!opts?.silent) toast.success('已送出觀察員意見', '僅您本人、您的指導者與中心可見。');
    setText('');
    setOpen(false);
    router.refresh();
  }

  async function saveEdit(id: string, opts?: { silent?: boolean }): Promise<void> {
    if (!editText.trim()) {
      if (opts?.silent) throw new Error('內容不可空白');
      return;
    }
    setBusy(true);
    let res: Response;
    try {
      res = await fetch(`/api/practice-comments/${id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ content: editText.trim() }),
      });
    } finally {
      setBusy(false);
    }
    if (!res.ok) {
      const j = await res.json().catch(() => ({ error: '儲存失敗' }));
      if (opts?.silent) throw new Error(j.error ?? '儲存失敗');
      toast.error('儲存失敗', j.error);
      return;
    }
    if (!opts?.silent) toast.success('已更新觀察員意見');
    setEditingId(null);
    router.refresh();
  }

  // 統一「儲存」鈕(批68 Q2):新增草稿有內容 → flush;正在編輯且有改動 → flush(皆靜默)。
  const flushRef = useRef<() => Promise<void> | null>(() => null);
  flushRef.current = () => {
    const tasks: Promise<void>[] = [];
    if (open && text.trim()) tasks.push(create({ silent: true }));
    if (editingId) {
      const orig = comments.find((c) => c.id === editingId)?.content ?? '';
      if (editText.trim() && editText !== orig) tasks.push(saveEdit(editingId, { silent: true }));
    }
    return tasks.length ? Promise.all(tasks).then(() => {}) : null;
  };
  useEffect(() => onFlushReviewNotes(() => flushRef.current()), []);

  async function remove() {
    if (!deleting) return;
    setBusy(true);
    const res = await fetch(`/api/practice-comments/${deleting.id}`, { method: 'DELETE' });
    setBusy(false);
    setDeleting(null);
    if (!res.ok) {
      const j = await res.json().catch(() => ({ error: '刪除失敗' }));
      toast.error('刪除失敗', j.error);
      return;
    }
    toast.success('已刪除觀察員意見');
    router.refresh();
  }

  return (
    // 間距歸呼叫端(review page 底部 grid 已有 mt-3;原自帶 mt-3 會與之疊加,兩欄頂線不齊)
    <div className="flex flex-col gap-2">
      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(o) => !o && setDeleting(null)}
        title="刪除這則觀察員意見？"
        description={deleting ? `「${deleting.content.slice(0, 60)}${deleting.content.length > 60 ? '…' : ''}」刪除後無法復原。` : undefined}
        confirmLabel="刪除"
        tone="danger"
        loading={busy}
        onConfirm={remove}
      />
      {comments.map((c) =>
        editingId === c.id ? (
          <div key={c.id} className="flex flex-col gap-2">
            <Textarea value={editText} onChange={(e) => setEditText(e.target.value)} rows={3} />
            <div className="flex gap-2">
              <Button size="sm" loading={busy} onClick={() => saveEdit(c.id)}>儲存</Button>
              <Button size="sm" variant="ghost" onClick={() => setEditingId(null)}>取消</Button>
            </div>
          </div>
        ) : (
          <NoteBox key={c.id} tone="primary" label={`觀察員意見（練習）· ${c.timeLabel}`}>
            <p className="text-body-sm text-primary-900 leading-relaxed whitespace-pre-wrap">{c.content}</p>
            <div className="mt-1.5 flex gap-3">
              <button
                type="button"
                className="text-caption text-primary-700 hover:underline focus-ring rounded-sm"
                onClick={() => { setEditingId(c.id); setEditText(c.content); }}
              >
                修正
              </button>
              <button
                type="button"
                className="text-caption text-ink-500 hover:text-danger-700 focus-ring rounded-sm"
                onClick={() => setDeleting(c)}
              >
                刪除
              </button>
            </div>
          </NoteBox>
        ),
      )}
      {/* UAT 圖78:與委員意見同款工作台——新增時自動展開稽核依據 */}
      <CommentWorkbench label="觀察員意見（練習）" auditBasis={auditBasis}>
        {({ openBasis }) =>
          open ? (
            <div className="flex flex-col gap-2">
              <Textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                rows={3}
                placeholder="觀察員意見…"
              />
              <div className="flex gap-2">
                <Button size="sm" loading={busy} onClick={() => create()}>送出意見</Button>
                <Button size="sm" variant="ghost" onClick={() => { setOpen(false); setText(''); }}>取消</Button>
              </div>
            </div>
          ) : (
            <Button size="sm" variant="ghost" leadingIcon={<Plus size={14} />} onClick={() => { setOpen(true); openBasis(); }} className="self-start">
              新增觀察員意見
            </Button>
          )
        }
      </CommentWorkbench>
    </div>
  );
}
