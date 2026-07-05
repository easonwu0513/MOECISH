'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/Button';
import { Card, CardTitle, CardDescription } from '@/components/ui/Card';
import { TextField } from '@/components/ui/TextField';
import { Textarea } from '@/components/ui/Textarea';
import { Select } from '@/components/ui/Select';
import { ConfirmDialog } from '@/components/ui/Dialog';
import { FileUploadButton } from '@/components/ui/FileUploadButton';
import { useToast } from '@/components/ui/Toast';
import { FileText } from '@/components/icons';
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

type PostAtt = { id: string; fileName: string; mimeType: string; sizeBytes: number };

function fmtSize(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

export default function PostEditor({ post, attachments = [] }: { post: PostData | null; attachments?: PostAtt[] }) {
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

  // ── 附件與圖片(不限格式;圖片可插入內文)──
  const [uploading, setUploading] = useState(false);
  const [deletingAtt, setDeletingAtt] = useState<PostAtt | null>(null);

  async function uploadAtt(e: React.ChangeEvent<HTMLInputElement>) {
    if (!post) return;
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    if (f.size > 20 * 1024 * 1024) { toast.error('上傳失敗', '檔案超過 20MB 上限'); return; }
    setUploading(true);
    const fd = new FormData();
    fd.append('file', f);
    const res = await fetch(`/api/admin/posts/${post.id}/attachments`, { method: 'POST', body: fd }).catch(() => null);
    setUploading(false);
    if (!res || !res.ok) {
      const j = res ? await res.json().catch(() => ({})) : {};
      toast.error('上傳失敗', (j as { error?: string }).error ?? '連線逾時或網路中斷,請稍後再試');
      return;
    }
    toast.success('已上傳附件', f.name);
    router.refresh();
  }

  async function removeAtt() {
    if (!post || !deletingAtt) return;
    setBusy(true);
    const res = await fetch(`/api/admin/posts/${post.id}/attachments/${deletingAtt.id}`, { method: 'DELETE' }).catch(() => null);
    setBusy(false);
    setDeletingAtt(null);
    if (!res || !res.ok) { toast.error('刪除附件失敗', res ? undefined : '連線逾時或網路中斷,請稍後再試'); return; }
    toast.success('已刪除附件');
    router.refresh();
  }

  /** 於游標處插入圖片 markdown(前台以內嵌圖顯示) */
  function insertImage(att: PostAtt) {
    const md = `![${att.fileName}](/api/post-attachments/${att.id}/download?inline=1)`;
    const el = contentRef.current;
    if (el) {
      const start = el.selectionStart ?? contentMd.length;
      const end = el.selectionEnd ?? start;
      setContentMd(contentMd.slice(0, start) + `\n${md}\n` + contentMd.slice(end));
      requestAnimationFrame(() => {
        el.focus();
        const pos = start + md.length + 2;
        el.setSelectionRange(pos, pos);
      });
    } else {
      setContentMd((c) => `${c}\n${md}\n`);
    }
  }

  return (
    <Card>
      <CardTitle>{isNew ? '新增公告' : '編輯公告'}</CardTitle>
      <CardDescription>
        內文支援 Markdown:<code className="font-mono"># 標題</code>、<code className="font-mono">**粗體**</code>、<code className="font-mono">- 清單</code>、<code className="font-mono">[連結](https://…)</code>、<code className="font-mono">![圖片](…)</code>(下方上傳後點「插入內文」)
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
          <label className="inline-flex items-center gap-2 text-body-sm text-ink-900 cursor-pointer h-14">
            <input type="checkbox" checked={pinned} onChange={(e) => setPinned(e.target.checked)} className="accent-primary-600" />
            置頂
          </label>
          <label className="inline-flex items-center gap-2 text-body-sm text-ink-900 cursor-pointer h-14">
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

        {/* 附件與圖片:不限檔案格式(下載端 attachment+nosniff);圖片可嵌入內文 */}
        <div className="rounded-lg border border-rule bg-paper-sunk p-4">
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div className="min-w-0">
              <p className="text-title text-ink-900">附件與圖片</p>
              <p className="mt-0.5 text-caption text-ink-500 leading-relaxed">
                不限檔案格式,單檔 ≤ 20MB。圖片可點「插入內文」嵌入 Markdown 顯示;所有附件都會在前台公告底部列為可下載檔案。
              </p>
            </div>
            {!isNew && (
              <FileUploadButton size="sm" label="+ 上傳附件" busy={uploading} onChange={uploadAtt} />
            )}
          </div>
          {isNew ? (
            <p className="mt-3 text-body-sm text-ink-500">先按「儲存草稿」建立公告後,即可上傳附件與圖片。</p>
          ) : attachments.length === 0 ? (
            <p className="mt-3 text-body-sm text-ink-500">尚無附件。</p>
          ) : (
            <ul className="mt-3 flex flex-col gap-1.5">
              {attachments.map((a) => (
                <li key={a.id} className="flex items-center gap-2 text-body-sm min-w-0">
                  <FileText size={14} className="shrink-0 text-ink-500" />
                  <a href={`/api/post-attachments/${a.id}/download`} className="text-primary-700 hover:underline truncate">
                    {a.fileName}
                  </a>
                  <span className="shrink-0 text-caption text-ink-500 tabular-nums">{fmtSize(a.sizeBytes)}</span>
                  {/^image\//i.test(a.mimeType) && (
                    <button
                      type="button"
                      onClick={() => insertImage(a)}
                      className="shrink-0 text-caption text-primary-700 hover:underline focus-ring rounded-sm px-1"
                    >
                      插入內文
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setDeletingAtt(a)}
                    className="shrink-0 text-caption text-ink-500 hover:text-danger-700 focus-ring rounded-sm px-1"
                  >
                    刪除
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

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
        description="刪除後無法復原(附件將一併刪除)。確定刪除?"
        confirmLabel="刪除"
        tone="danger"
        onConfirm={remove}
        loading={busy}
      />

      <ConfirmDialog
        open={deletingAtt !== null}
        onOpenChange={(o) => !busy && !o && setDeletingAtt(null)}
        title="刪除附件"
        description={deletingAtt ? `確定刪除附件「${deletingAtt.fileName}」?若內文已插入此圖片,前台將無法顯示(請一併移除該行)。` : undefined}
        confirmLabel="刪除"
        tone="danger"
        onConfirm={removeAtt}
        loading={busy}
      />
    </Card>
  );
}
