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
import { Select } from '@/components/ui/Select';
import { EmptyState } from '@/components/ui/EmptyState';
import { useToast } from '@/components/ui/Toast';
import { Plus, FileText } from '@/components/icons';
import { PREP_CATEGORY_LABELS, type PrepCategory } from '@/lib/types';

type Item = { id: string; title: string; description: string | null; category: string; required: boolean; year: number | null };
const GROUP_ORDER: PrepCategory[] = ['TECH', 'ONSITE', 'CENTER'];

export default function PrepTemplateManager({ initialItems }: { initialItems: Item[] }) {
  const router = useRouter();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Item | null>(null);
  // year 表單值:'' = 通用;否則西元年字串(顯示為民國)
  const [form, setForm] = useState<{ title: string; description: string; category: PrepCategory; required: boolean; year: string }>(
    { title: '', description: '', category: 'ONSITE', required: true, year: '' },
  );
  const [deleting, setDeleting] = useState<Item | null>(null);
  // 年度頁籤:'all' 全部 / 'generic' 通用 / 各年度(西元字串)
  const [yearTab, setYearTab] = useState<string>('all');

  // 年度選項:既有年度 ∪ 今明兩年(西元;顯示民國)
  const thisYear = new Date().getFullYear();
  const yearOptions = [...new Set([...initialItems.map((i) => i.year).filter((y): y is number => y != null), thisYear, thisYear + 1])].sort((a, b) => b - a);
  const shownItems = initialItems.filter((i) =>
    yearTab === 'all' ? true : yearTab === 'generic' ? i.year == null : i.year === Number(yearTab),
  );

  function openAdd() {
    // 新增預設帶目前頁籤的年度(在某年度頁籤下新增=直覺歸入該年度)
    setForm({ title: '', description: '', category: 'ONSITE', required: true, year: yearTab !== 'all' && yearTab !== 'generic' ? yearTab : '' });
    setEditing(null);
    setOpen(true);
  }
  function openEdit(it: Item) {
    setForm({ title: it.title, description: it.description ?? '', category: (it.category || 'ONSITE') as PrepCategory, required: it.required, year: it.year != null ? String(it.year) : '' });
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
        year: form.year ? Number(form.year) : null,
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
      <div className="flex items-center justify-between gap-3 flex-wrap">
        {/* 年度頁籤(比照檢核表題庫):通用=每年都帶;各年度=只帶該年週期(同名覆寫通用) */}
        <Segmented
          value={yearTab}
          onChange={(v) => setYearTab(v)}
          options={[
            { value: 'all', label: '全部' },
            { value: 'generic', label: `通用 ${initialItems.filter((i) => i.year == null).length}` },
            ...yearOptions.map((y) => ({ value: String(y), label: `${y - 1911} 年度 ${initialItems.filter((i) => i.year === y).length}` })),
          ]}
        />
        <Button size="sm" leadingIcon={<Plus size={15} />} onClick={openAdd}>新增項目</Button>
      </div>

      {shownItems.length === 0 ? (
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
            const g = shownItems.filter((i) => (i.category || 'ONSITE') === cat);
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
                            {it.year != null
                              ? <Chip tone="primary" size="sm">{it.year - 1911} 年度</Chip>
                              : <Chip tone="neutral" size="sm">通用</Chip>}
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
          <Select label="適用年度" value={form.year} onChange={(e) => setForm((f) => ({ ...f, year: e.target.value }))}>
            <option value="">通用(每年都帶入)</option>
            {yearOptions.map((y) => (
              <option key={y} value={String(y)}>{y - 1911} 年度</option>
            ))}
          </Select>
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
