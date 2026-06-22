'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Chip } from '@/components/ui/Chip';
import { Dialog, ConfirmDialog } from '@/components/ui/Dialog';
import { TextField } from '@/components/ui/TextField';
import { Textarea } from '@/components/ui/Textarea';
import { Segmented } from '@/components/ui/Segmented';
import { EmptyState } from '@/components/ui/EmptyState';
import { useToast } from '@/components/ui/Toast';
import { Plus, FileText } from '@/components/icons';
import { PREP_CATEGORY_LABELS, type PrepCategory } from '@/lib/types';

type Item = { id: string; title: string; description: string | null; category: string; required: boolean };
const GROUP_ORDER: PrepCategory[] = ['TECH', 'ONSITE', 'CENTER'];

export default function PrepTemplateManager({ initialItems }: { initialItems: Item[] }) {
  const router = useRouter();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Item | null>(null);
  const [form, setForm] = useState<{ title: string; description: string; category: PrepCategory; required: boolean }>(
    { title: '', description: '', category: 'ONSITE', required: true },
  );
  const [deleting, setDeleting] = useState<Item | null>(null);

  function openAdd() {
    setForm({ title: '', description: '', category: 'ONSITE', required: true });
    setEditing(null);
    setOpen(true);
  }
  function openEdit(it: Item) {
    setForm({ title: it.title, description: it.description ?? '', category: (it.category || 'ONSITE') as PrepCategory, required: it.required });
    setEditing(it);
    setOpen(true);
  }

  async function submit() {
    if (form.title.trim().length < 2) { toast.error('請輸入項目名稱'); return; }
    setBusy(true);
    const url = editing ? `/api/admin/prep-template/${editing.id}` : '/api/admin/prep-template';
    const res = await fetch(url, {
      method: editing ? 'PATCH' : 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        title: form.title.trim(),
        description: form.description.trim() || null,
        category: form.category,
        required: form.required,
      }),
    });
    setBusy(false);
    if (!res.ok) {
      const j = await res.json().catch(() => ({ error: '失敗' }));
      toast.error(editing ? '更新失敗' : '新增失敗', j.error);
      return;
    }
    toast.success(editing ? '已更新' : '已新增');
    setOpen(false);
    router.refresh();
  }

  async function remove(it: Item) {
    setBusy(true);
    const res = await fetch(`/api/admin/prep-template/${it.id}`, { method: 'DELETE' });
    setBusy(false);
    setDeleting(null);
    if (!res.ok) { toast.error('刪除失敗'); return; }
    toast.success('已刪除');
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <Button size="sm" leadingIcon={<Plus size={15} />} onClick={openAdd}>新增項目</Button>
      </div>

      {initialItems.length === 0 ? (
        <Card variant="outlined" padded={false}>
          <div className="p-6">
            <EmptyState
              icon={<FileText size={28} />}
              title="標準清單尚為空"
              description="新增項目後,各週期「套用標準清單」會帶入這些項目;清單為空時帶入系統內建預設。"
            />
          </div>
        </Card>
      ) : (
        <div className="flex flex-col gap-6">
          {GROUP_ORDER.map((cat) => {
            const g = initialItems.filter((i) => (i.category || 'ONSITE') === cat);
            if (g.length === 0) return null;
            return (
              <section key={cat}>
                <div className="flex items-center gap-2 mb-2">
                  <h2 className="text-title-md text-on-surface">{PREP_CATEGORY_LABELS[cat]}</h2>
                  <Chip tone="neutral" size="sm">{g.length}</Chip>
                </div>
                <div className="flex flex-col gap-2">
                  {g.map((it) => (
                    <Card key={it.id} padded={false} variant="elevated">
                      <div className="p-4 flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className="text-title text-on-surface">{it.title}</p>
                            {!it.required && <Chip tone="neutral" size="sm">選附</Chip>}
                          </div>
                          {it.description && (
                            <p className="mt-1 text-body-sm text-on-surface-variant leading-relaxed">{it.description}</p>
                          )}
                        </div>
                        <div className="flex gap-2 shrink-0">
                          <Button size="sm" variant="ghost" onClick={() => openEdit(it)}>編輯</Button>
                          <Button size="sm" variant="text" onClick={() => setDeleting(it)}>刪除</Button>
                        </div>
                      </div>
                    </Card>
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      )}

      <Dialog
        open={open}
        onOpenChange={(v) => !busy && setOpen(v)}
        title={editing ? '編輯標準清單項目' : '新增標準清單項目'}
        description="分區決定此項落在哪一繳交區(中心匯入由中心上傳)。"
        footer={
          <>
            <Button variant="text" onClick={() => setOpen(false)} disabled={busy}>取消</Button>
            <Button onClick={submit} loading={busy}>{editing ? '儲存' : '新增'}</Button>
          </>
        }
      >
        <div className="flex flex-col gap-4 pt-2">
          <div>
            <p className="text-caption font-medium text-on-surface-variant mb-1.5">分區</p>
            <Segmented
              value={form.category}
              onChange={(v) => setForm((f) => ({ ...f, category: v as PrepCategory }))}
              options={[
                { value: 'TECH', label: '技術檢測' },
                { value: 'ONSITE', label: '實地稽核' },
                { value: 'CENTER', label: '中心匯入' },
              ]}
            />
          </div>
          <TextField label="項目名稱" value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} placeholder="例:資通安全維護計畫" />
          <Textarea label="說明(選填)" value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} rows={2} placeholder="例:最新核定版本" />
          <label className="flex items-center gap-2 text-body-sm text-on-surface">
            <input
              type="checkbox"
              checked={form.required}
              onChange={(e) => setForm((f) => ({ ...f, required: e.target.checked }))}
              className="w-4 h-4 rounded focus-ring accent-primary-600"
            />
            必填(機關須上傳或敘明;取消則為選附)
          </label>
        </div>
      </Dialog>

      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(o) => !busy && !o && setDeleting(null)}
        title="刪除標準清單項目"
        description={deleting ? `確定刪除「${deleting.title}」?(不影響已開立週期既有的項目)` : undefined}
        confirmLabel="刪除"
        tone="danger"
        onConfirm={() => { if (deleting) remove(deleting); }}
        loading={busy}
      />
    </div>
  );
}
