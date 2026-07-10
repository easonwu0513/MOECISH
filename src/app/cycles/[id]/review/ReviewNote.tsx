'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { NoteBox } from '@/components/cycle/NoteBox';
import { Chip } from '@/components/ui/Chip';
import { Button } from '@/components/ui/Button';
import { Textarea } from '@/components/ui/Textarea';
import { ConfirmDialog } from '@/components/ui/Dialog';
import { useToast } from '@/components/ui/Toast';
import { Pencil, Trash2 } from '@/components/icons';

/**
 * 委員審閱筆記單則(圖5):作者本人可就地「修正」或「刪除」自己的筆記。
 * 機關已回應(resolved)之筆記由伺服器擋下修改,前端亦不顯示操作鈕。
 */
export default function ReviewNote({
  responseId,
  commentId,
  authorLabel,
  timeLabel,
  resolved,
  content,
  canManage,
}: {
  responseId: string;
  commentId: string;
  authorLabel: string;
  timeLabel: string;
  resolved: boolean;
  content: string;
  canManage: boolean;
}) {
  const router = useRouter();
  const toast = useToast();
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(content);
  const [saving, setSaving] = useState(false);
  const [confirmDel, setConfirmDel] = useState(false);
  const [deleting, setDeleting] = useState(false);

  async function save() {
    if (!text.trim()) {
      toast.error('內容不可空白');
      return;
    }
    setSaving(true);
    const res = await fetch(`/api/responses/${responseId}/comments/${commentId}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ content: text }),
    });
    setSaving(false);
    if (!res.ok) {
      const j = await res.json().catch(() => ({ error: '更新失敗' }));
      toast.error('更新失敗', j.error);
      return;
    }
    toast.success('已更新審閱筆記');
    setEditing(false);
    router.refresh();
  }

  async function doDelete() {
    setDeleting(true);
    const res = await fetch(`/api/responses/${responseId}/comments/${commentId}`, {
      method: 'DELETE',
    });
    setDeleting(false);
    if (!res.ok) {
      const j = await res.json().catch(() => ({ error: '刪除失敗' }));
      toast.error('刪除失敗', j.error);
      return;
    }
    setConfirmDel(false);
    toast.success('已刪除審閱筆記');
    router.refresh();
  }

  return (
    <NoteBox
      tone={resolved ? 'success' : 'primary'}
      header={
        <div className="text-caption text-ink-500 mb-1 flex items-center gap-2">
          {/* 批34 圖1:委員審閱筆記無「輪次」概念,不顯示 round(資料欄仍在,供匯出/機關端補正對位) */}
          <span>
            {authorLabel} · {timeLabel}
          </span>
          {resolved && (
            <Chip tone="success" size="sm">
              已補正
            </Chip>
          )}
        </div>
      }
    >
      {editing ? (
        <div className="flex flex-col gap-2">
          <Textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={3}
            placeholder="審閱筆記…"
          />
          <div className="flex gap-2">
            <Button size="sm" loading={saving} onClick={save}>
              儲存
            </Button>
            <Button
              size="sm"
              variant="ghost"
              disabled={saving}
              onClick={() => {
                setEditing(false);
                setText(content);
              }}
            >
              取消
            </Button>
          </div>
        </div>
      ) : (
        <>
          <p className="whitespace-pre-wrap text-body-sm text-ink-500 leading-relaxed">{content}</p>
          {canManage && (
            <div className="mt-2 flex flex-wrap gap-1">
              <Button
                size="sm"
                variant="text"
                leadingIcon={<Pencil size={13} />}
                onClick={() => {
                  setText(content);
                  setEditing(true);
                }}
              >
                修正
              </Button>
              <Button
                size="sm"
                variant="text"
                leadingIcon={<Trash2 size={13} />}
                onClick={() => setConfirmDel(true)}
              >
                刪除
              </Button>
            </div>
          )}
        </>
      )}
      <ConfirmDialog
        open={confirmDel}
        onOpenChange={(o) => !o && setConfirmDel(false)}
        title="刪除這則審閱筆記？"
        description="刪除後無法復原。這僅刪除您自己的筆記。"
        confirmLabel="刪除"
        tone="danger"
        loading={deleting}
        onConfirm={doDelete}
      />
    </NoteBox>
  );
}
