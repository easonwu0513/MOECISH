'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/Button';
import { Card, CardTitle, CardDescription } from '@/components/ui/Card';
import { TextField } from '@/components/ui/TextField';
import { Textarea } from '@/components/ui/Textarea';
import { Select } from '@/components/ui/Select';
import { ConfirmDialog } from '@/components/ui/Dialog';
import { useToast } from '@/components/ui/Toast';
import { POST_CATEGORIES, POST_CATEGORY_LABELS } from '@/lib/types';

type PostData = {
  id: string;
  slug: string;
  title: string;
  category: string;
  contentMd: string;
  important: boolean;
  pinned: boolean;
  status: string;
};

export default function PostEditor({ post }: { post: PostData | null }) {
  const router = useRouter();
  const toast = useToast();
  const isNew = post === null;

  const [title, setTitle] = useState(post?.title ?? '');
  const [category, setCategory] = useState(post?.category ?? 'ANNOUNCEMENT');
  const [contentMd, setContentMd] = useState(post?.contentMd ?? '');
  const [important, setImportant] = useState(post?.important ?? false);
  const [pinned, setPinned] = useState(post?.pinned ?? false);
  const [busy, setBusy] = useState(false);
  const [delOpen, setDelOpen] = useState(false);
  const [titleErr, setTitleErr] = useState<string | null>(null);
  const [contentErr, setContentErr] = useState<string | null>(null);
  const titleRef = useRef<HTMLInputElement>(null);
  const contentRef = useRef<HTMLTextAreaElement>(null);

  async function save(): Promise<string | null> {
    const badTitle = title.trim().length < 2;
    const badContent = contentMd.trim().length < 5;
    setTitleErr(badTitle ? '請輸入標題（至少 2 個字）' : null);
    setContentErr(badContent ? '請輸入內文（至少 5 個字）' : null);
    if (badTitle) { titleRef.current?.focus(); return null; }
    if (badContent) { contentRef.current?.focus(); return null; }
    setBusy(true);
    const payload = { title: title.trim(), category, contentMd, important, pinned };
    const res = isNew
      ? await fetch('/api/admin/posts', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(payload),
        })
      : await fetch(`/api/admin/posts/${post!.id}`, {
          method: 'PATCH',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(payload),
        });
    setBusy(false);
    if (!res.ok) {
      const j = await res.json().catch(() => ({ error: '儲存失敗' }));
      toast.error('儲存失敗', j.error);
      return null;
    }
    const j = await res.json();
    return j.item.id as string;
  }

  async function saveDraft() {
    const id = await save();
    if (id) {
      toast.success('已儲存草稿');
      if (isNew) router.replace(`/admin/posts/${id}`);
      router.refresh();
    }
  }

  async function publish() {
    const id = await save();
    if (!id) return;
    setBusy(true);
    const res = await fetch(`/api/admin/posts/${id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ status: 'PUBLISHED' }),
    });
    setBusy(false);
    if (res.ok) {
      toast.success('已發布', '前台立即可見。');
      router.push('/admin/posts');
      router.refresh();
    } else {
      const j = await res.json().catch(() => ({ error: '發布失敗' }));
      toast.error('發布失敗', j.error);
    }
  }

  async function archive() {
    if (!post) return;
    setBusy(true);
    const res = await fetch(`/api/admin/posts/${post.id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ status: 'ARCHIVED' }),
    });
    setBusy(false);
    if (res.ok) {
      toast.success('已下架');
      router.refresh();
    }
  }

  async function remove() {
    if (!post) return;
    setBusy(true);
    const res = await fetch(`/api/admin/posts/${post.id}`, { method: 'DELETE' });
    setBusy(false);
    setDelOpen(false);
    if (res.ok) {
      toast.success('已刪除');
      router.push('/admin/posts');
      router.refresh();
    }
  }

  return (
    <Card>
      <CardTitle>{isNew ? '新增公告' : '編輯公告'}</CardTitle>
      <CardDescription>
        內文支援 Markdown:<code className="font-mono"># 標題</code>、<code className="font-mono">**粗體**</code>、<code className="font-mono">- 清單</code>、<code className="font-mono">[連結](https://…)</code>
      </CardDescription>

      <div className="mt-5 flex flex-col gap-4">
        <TextField
          ref={titleRef}
          label="標題"
          value={title}
          onChange={(e) => { setTitle(e.target.value); if (titleErr) setTitleErr(null); }}
          errorText={titleErr ?? undefined}
        />
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 items-end">
          <Select label="分類" value={category} onChange={(e) => setCategory(e.target.value)}>
            {POST_CATEGORIES.map((c) => (
              <option key={c} value={c}>{POST_CATEGORY_LABELS[c]}</option>
            ))}
          </Select>
          <label className="inline-flex items-center gap-2 text-body-sm text-on-surface cursor-pointer h-14">
            <input type="checkbox" checked={pinned} onChange={(e) => setPinned(e.target.checked)} className="accent-primary-600" />
            置頂
          </label>
          <label className="inline-flex items-center gap-2 text-body-sm text-on-surface cursor-pointer h-14">
            <input type="checkbox" checked={important} onChange={(e) => setImportant(e.target.checked)} className="accent-primary-600" />
            標記重要(前台紅色橫幅)
          </label>
        </div>
        <Textarea
          ref={contentRef}
          label="內文(Markdown)"
          value={contentMd}
          onChange={(e) => { setContentMd(e.target.value); if (contentErr) setContentErr(null); }}
          rows={14}
          placeholder={'## 摘要\n\n說明文字…\n\n- 重點一\n- 重點二'}
          errorText={contentErr ?? undefined}
        />

        <div className="flex flex-wrap gap-2 pt-1">
          <Button variant="tonal" onClick={saveDraft} loading={busy}>儲存草稿</Button>
          <Button onClick={publish} loading={busy}>
            {post?.status === 'PUBLISHED' ? '更新並保持發布' : '發布'}
          </Button>
          {!isNew && post!.status === 'PUBLISHED' && (
            <Button variant="text" onClick={archive} disabled={busy}>下架</Button>
          )}
          {!isNew && (
            <Button variant="text" onClick={() => setDelOpen(true)} disabled={busy}>刪除</Button>
          )}
        </div>
      </div>

      <ConfirmDialog
        open={delOpen}
        onOpenChange={(o) => !busy && setDelOpen(o)}
        title="刪除公告"
        description="刪除後無法復原。確定刪除?"
        confirmLabel="刪除"
        tone="danger"
        onConfirm={remove}
        loading={busy}
      />
    </Card>
  );
}
