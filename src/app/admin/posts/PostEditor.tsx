'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/Button';
import { Card, CardTitle, CardDescription } from '@/components/ui/Card';
import { TextField } from '@/components/ui/TextField';
import { Textarea } from '@/components/ui/Textarea';
import { Select } from '@/components/ui/Select';
import { Dialog, ConfirmDialog } from '@/components/ui/Dialog';
import { Chip } from '@/components/ui/Chip';
import { FileUploadButton } from '@/components/ui/FileUploadButton';
import { useToast } from '@/components/ui/Toast';
import { FileText } from '@/components/icons';
import { Markdown } from '@/lib/markdown';
import { POST_CATEGORIES, POST_CATEGORY_LABELS, type PostCategory } from '@/lib/types';
import { POST_CATEGORY_TONE } from '@/lib/tone';

type PostData = {
  id: string;
  slug: string;
  title: string;
  category: string;
  contentMd: string;
  important: boolean;
  pinned: boolean;
  status: string;
  publishedAtISO?: string | null;
  unpublishAtISO?: string | null;
};

/** ISO(UTC)→ datetime-local 輸入值(台灣時間 YYYY-MM-DDTHH:mm);null→''。 */
function isoToLocalInput(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  // 轉 +08:00 當地時間再取 YYYY-MM-DDTHH:mm
  const tw = new Date(d.getTime() + 8 * 3600 * 1000);
  return tw.toISOString().slice(0, 16);
}

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
  // 批33 排程上下架(datetime-local;台灣時間)。空=立即上架/不自動下架。
  const [publishAt, setPublishAt] = useState(isoToLocalInput(post?.publishedAtISO));
  const [unpublishAt, setUnpublishAt] = useState(isoToLocalInput(post?.unpublishAtISO));
  const [busy, setBusy] = useState(false);
  const [delOpen, setDelOpen] = useState(false);
  // 預覽(UAT):上架前先看前台實際渲染樣貌(同一支 lib/markdown 渲染器,與前台公告頁一致)
  const [previewOpen, setPreviewOpen] = useState(false);
  const [titleErr, setTitleErr] = useState<string | null>(null);
  const [contentErr, setContentErr] = useState<string | null>(null);
  const titleRef = useRef<HTMLInputElement>(null);
  const contentRef = useRef<HTMLTextAreaElement>(null);

  /** 儲存(建立=POST 為草稿;既有=PATCH)。extra 供發布時一併帶入 status+排程,避免分兩次 PATCH
   *  導致第二次無排程 body 把 publishedAt 覆寫成 now(排程被清)。 */
  async function save(extra: Record<string, unknown> = {}): Promise<string | null> {
    const badTitle = title.trim().length < 2;
    const badContent = contentMd.trim().length < 5;
    setTitleErr(badTitle ? '請輸入標題（至少 2 個字）' : null);
    setContentErr(badContent ? '請輸入內文（至少 5 個字）' : null);
    if (badTitle) { titleRef.current?.focus(); return null; }
    if (badContent) { contentRef.current?.focus(); return null; }
    if (publishAt && unpublishAt && unpublishAt <= publishAt) {
      toast.error('時間設定不正確', '排定下架時間須晚於上架時間。');
      return null;
    }
    setBusy(true);
    // 排程欄一律隨存帶上(草稿也保留設定;建立與更新皆會保存排程——UAT 批43 前建立會丟棄)。
    const payload = { title: title.trim(), category, contentMd, important, pinned, publishAt, unpublishAt, ...extra };
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

  const scheduledFuture = () => {
    if (!publishAt) return false;
    return new Date(`${publishAt}:00+08:00`).getTime() > Date.now();
  };
  // 發布後實際是否已過下架時間(前台不會顯示)——用於誠實的 toast(對抗審查 P2:避免「已發布/立即可見」誤導)。
  const alreadyOff = () => {
    if (!unpublishAt) return false;
    return new Date(`${unpublishAt}:00+08:00`).getTime() <= Date.now();
  };

  async function publish() {
    // 既有公告:一次 PATCH 帶 status+排程。新公告:先 POST 建草稿,再 PATCH 發布(帶排程)。
    let id: string | null;
    if (isNew) {
      id = await save();
      if (!id) return;
      setBusy(true);
      const res = await fetch(`/api/admin/posts/${id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ status: 'PUBLISHED', publishAt, unpublishAt }),
      });
      setBusy(false);
      if (!res.ok) {
        const j = await res.json().catch(() => ({ error: '發布失敗' }));
        toast.error('發布失敗', j.error);
        return;
      }
    } else {
      id = await save({ status: 'PUBLISHED' });
      if (!id) return;
    }
    if (alreadyOff()) {
      toast.warning('已發布,但已過排定下架時間', '前台目前不會顯示;如需顯示,請於編輯頁調整或清除下架時間。');
    } else if (scheduledFuture()) {
      toast.success('已排程發布', '將於指定上架時間對外顯示。');
    } else {
      toast.success('已發布', '前台立即可見。');
    }
    router.push('/admin/posts');
    router.refresh();
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
    if (!res || !res.ok) {
      const j = res ? await res.json().catch(() => ({})) : {};
      toast.error('刪除附件失敗', res ? (j as { error?: string }).error : '連線逾時或網路中斷,請稍後再試');
      return;
    }
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
        // preventScroll:附件列在 textarea 下方,focus 預設會把高大的 textarea 捲進視野=整頁跳到上方
        el.focus({ preventScroll: true });
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

        {/* 批33 排程上下架:設定何時上架、何時自動下架,免人工盯場。 */}
        <div className="rounded-lg border border-rule bg-paper-sunk p-4">
          <p className="text-title text-ink-900">排程上下架</p>
          <p className="mt-0.5 text-caption text-ink-500 leading-relaxed">
            按「發布」後,系統依此時間窗自動控制前台顯示:上架時間未到=「待發布」、到達=「發布中」、
            過下架時間=自動「已下架」。留空=立即上架 / 不自動下架。
          </p>
          <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-4">
            <TextField
              label="排定上架時間(留空=立即)"
              type="datetime-local"
              value={publishAt}
              onChange={(e) => setPublishAt(e.target.value)}
            />
            <TextField
              label="排定下架時間(留空=不自動下架)"
              type="datetime-local"
              value={unpublishAt}
              onChange={(e) => setUnpublishAt(e.target.value)}
            />
          </div>
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
                不限檔案格式,單檔 ≤ 20MB。圖片可點「插入內文」嵌入 Markdown 顯示;已嵌入內文的圖片不會重複列在前台附件下載清單,其餘附件會列於公告底部供下載。
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

        <Dialog
          open={previewOpen}
          onOpenChange={setPreviewOpen}
          size="lg"
          title="預覽公告"
          description="以前台公告頁相同的渲染方式顯示;確認排版無誤後再發布。"
          footer={<Button variant="tonal" onClick={() => setPreviewOpen(false)}>關閉</Button>}
        >
          <div className="max-h-[60vh] overflow-y-auto pr-1">
            <div className="flex items-center gap-2 flex-wrap mb-3">
              <Chip tone={POST_CATEGORY_TONE[category as PostCategory] ?? 'primary'} size="sm" dot>
                {POST_CATEGORY_LABELS[category as PostCategory] ?? category}
              </Chip>
              {important && <Chip tone="danger" size="sm">重要</Chip>}
              {pinned && <Chip tone="neutral" size="sm">置頂</Chip>}
            </div>
            <h2 className="text-headline text-ink-900 leading-snug">{title || '(未輸入標題)'}</h2>
            <div className="mt-4 border-t border-rule pt-4">
              {contentMd.trim() ? <Markdown content={contentMd} /> : <p className="text-body-sm text-ink-500">(內文尚未填寫)</p>}
            </div>
          </div>
        </Dialog>

        <div className="flex flex-wrap gap-2 pt-1">
          <Button variant="text" onClick={() => setPreviewOpen(true)} disabled={busy}>預覽</Button>
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
        description="刪除後無法復原(附件將一併刪除)。確定刪除？"
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
