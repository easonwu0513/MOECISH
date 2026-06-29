'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Chip } from '@/components/ui/Chip';
import { Select } from '@/components/ui/Select';
import { Textarea } from '@/components/ui/Textarea';
import { ConfirmDialog } from '@/components/ui/Dialog';
import { EmptyState } from '@/components/ui/EmptyState';
import { useToast } from '@/components/ui/Toast';
import { Plus, ClipboardCheck } from '@/components/icons';
import {
  SNIPPET_ASPECTS, SNIPPET_KINDS, snippetAspectLabel, snippetKindLabel,
  type FindingSnippetDTO,
} from '@/lib/finding-snippet';

export default function SnippetManager({ initial }: { initial: FindingSnippetDTO[] }) {
  const router = useRouter();
  const toast = useToast();
  const [list, setList] = useState<FindingSnippetDTO[]>(initial);
  const [busy, setBusy] = useState<string | null>(null);

  // 新增表單
  const [newAspect, setNewAspect] = useState('');
  const [newKind, setNewKind] = useState('');
  const [newText, setNewText] = useState('');

  // 行內編輯
  const [editId, setEditId] = useState<string | null>(null);
  const [editAspect, setEditAspect] = useState('');
  const [editKind, setEditKind] = useState('');
  const [editText, setEditText] = useState('');

  const [deleting, setDeleting] = useState<FindingSnippetDTO | null>(null);

  async function create() {
    if (newText.trim().length < 1) {
      toast.error('內容不可空白');
      return;
    }
    setBusy('new');
    const res = await fetch('/api/admin/finding-snippets', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ aspect: newAspect, kind: newKind, text: newText.trim() }),
    });
    setBusy(null);
    if (!res.ok) {
      const j = await res.json().catch(() => ({ error: '新增失敗' }));
      toast.error('新增失敗', j.error);
      return;
    }
    const { snippet } = await res.json();
    setList((l) => [...l, { id: snippet.id, aspect: snippet.aspect, kind: snippet.kind, text: snippet.text }]);
    setNewText('');
    toast.success('已新增片語');
  }

  function startEdit(s: FindingSnippetDTO) {
    setEditId(s.id);
    setEditAspect(s.aspect);
    setEditKind(s.kind);
    setEditText(s.text);
  }

  async function saveEdit() {
    if (!editId || editText.trim().length < 1) {
      toast.error('內容不可空白');
      return;
    }
    setBusy(editId);
    const res = await fetch(`/api/admin/finding-snippets/${editId}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ aspect: editAspect, kind: editKind, text: editText.trim() }),
    });
    setBusy(null);
    if (!res.ok) {
      const j = await res.json().catch(() => ({ error: '儲存失敗' }));
      toast.error('儲存失敗', j.error);
      return;
    }
    setList((l) => l.map((x) => (x.id === editId ? { ...x, aspect: editAspect, kind: editKind, text: editText.trim() } : x)));
    setEditId(null);
    toast.success('已儲存');
  }

  async function remove(s: FindingSnippetDTO) {
    setBusy(s.id);
    const res = await fetch(`/api/admin/finding-snippets/${s.id}`, { method: 'DELETE' });
    setBusy(null);
    setDeleting(null);
    if (!res.ok) {
      const j = await res.json().catch(() => ({ error: '刪除失敗' }));
      toast.error('刪除失敗', j.error);
      return;
    }
    setList((l) => l.filter((x) => x.id !== s.id));
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-6">
      {/* 新增 */}
      <Card variant="outlined">
        <h2 className="text-title-md text-on-surface mb-3">新增片語</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Select label="適用構面" value={newAspect} onChange={(e) => setNewAspect(e.target.value)}>
            {SNIPPET_ASPECTS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </Select>
          <Select label="適用類型" value={newKind} onChange={(e) => setNewKind(e.target.value)}>
            {SNIPPET_KINDS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </Select>
        </div>
        <div className="mt-3">
          <Textarea
            label="片語內容"
            value={newText}
            onChange={(e) => setNewText(e.target.value)}
            rows={3}
            placeholder="例:依資通安全管理法施行細則第 9 條規定…,惟查…,建議…"
          />
        </div>
        <div className="mt-3 flex justify-end">
          <Button leadingIcon={<Plus size={15} />} onClick={create} loading={busy === 'new'}>新增片語</Button>
        </div>
      </Card>

      {/* 清單 */}
      <Card variant="outlined" padded={false}>
        <div className="px-5 py-3 border-b border-outline-variant/40 flex items-center gap-2">
          <ClipboardCheck size={16} className="text-on-surface-variant" />
          <span className="text-title text-on-surface">片語清單</span>
          <Chip size="sm" tone="neutral">{list.length}</Chip>
        </div>
        {list.length === 0 ? (
          <div className="p-6">
            <EmptyState icon={<ClipboardCheck size={26} />} title="尚無片語" description="於上方新增第一則常用發現片語。" />
          </div>
        ) : (
          <ul className="divide-y divide-outline-variant/40">
            {list.map((s) => (
              <li key={s.id} className="px-5 py-4">
                {editId === s.id ? (
                  <div className="flex flex-col gap-3">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <Select label="適用構面" value={editAspect} onChange={(e) => setEditAspect(e.target.value)}>
                        {SNIPPET_ASPECTS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                      </Select>
                      <Select label="適用類型" value={editKind} onChange={(e) => setEditKind(e.target.value)}>
                        {SNIPPET_KINDS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                      </Select>
                    </div>
                    <Textarea label="片語內容" value={editText} onChange={(e) => setEditText(e.target.value)} rows={3} />
                    <div className="flex justify-end gap-2">
                      <Button variant="text" onClick={() => setEditId(null)}>取消</Button>
                      <Button onClick={saveEdit} loading={busy === s.id}>儲存</Button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-start gap-3">
                    <div className="flex flex-col gap-1.5 shrink-0">
                      <Chip size="sm" tone="primary">{snippetAspectLabel(s.aspect)}</Chip>
                      <Chip size="sm" tone="sage">{snippetKindLabel(s.kind)}</Chip>
                    </div>
                    <p className="flex-1 min-w-0 text-body-sm text-on-surface-variant leading-relaxed whitespace-pre-wrap">{s.text}</p>
                    <div className="flex items-center gap-1 shrink-0">
                      <Button size="sm" variant="text" onClick={() => startEdit(s)}>編輯</Button>
                      <Button size="sm" variant="text" onClick={() => setDeleting(s)}>刪除</Button>
                    </div>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>

      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(o) => !o && setDeleting(null)}
        title="刪除這則片語?"
        description={deleting ? `「${deleting.text.slice(0, 50)}${deleting.text.length > 50 ? '…' : ''}」將被刪除。` : undefined}
        confirmLabel="刪除"
        tone="danger"
        onConfirm={() => { if (deleting) void remove(deleting); }}
        loading={busy === deleting?.id}
      />
    </div>
  );
}
