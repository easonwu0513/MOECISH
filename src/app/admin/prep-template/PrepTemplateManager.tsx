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
import { FileUploadButton } from '@/components/ui/FileUploadButton';
import { useToast } from '@/components/ui/Toast';
import { Plus, FileText } from '@/components/icons';
import { PREP_CATEGORY_LABELS, TEMPLATE_UPLOAD_ACCEPT, TEMPLATE_UPLOAD_MAX_BYTES, type PrepCategory } from '@/lib/types';

type TplFile = { id: string; originalName: string; sizeBytes: number };
type Item = { id: string; title: string; description: string | null; category: string; required: boolean; year: number | null; files: TplFile[] };

function fmtSize(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}
const GROUP_ORDER: PrepCategory[] = ['TECH', 'ONSITE', 'CENTER'];

export default function PrepTemplateManager({ initialItems, cycleYears = [] }: { initialItems: Item[]; cycleYears?: number[] }) {
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

  // 年度歷史檢視:每個年度頁籤顯示「該年度實際會帶入」的完整清單(非依儲存分類篩選)。
  // 年度來源:項目年度 ∪ 已開立週期年度 ∪ 今明兩年;升冪排列(歷史→未來),預設停在今年。
  const thisYear = new Date().getFullYear();
  const allYears = [...new Set([
    ...initialItems.map((i) => i.year).filter((y): y is number => y != null),
    ...cycleYears,
    thisYear,
    thisYear + 1,
  ])].sort((a, b) => a - b);
  const [yearTab, setYearTab] = useState<string>(String(thisYear));

  // 解析某年度的實際清單:與套用時(lib/prep-standard getStandardItems)同一套邏輯 —
  // 年度項優先,同標題覆寫通用項;其餘通用項每年都帶入。
  const genericTitles = new Set(initialItems.filter((i) => i.year == null).map((i) => i.title));
  function resolveYear(y: number): Item[] {
    const yearly = initialItems.filter((i) => i.year === y);
    const yearlyTitles = new Set(yearly.map((i) => i.title));
    return [...yearly, ...initialItems.filter((i) => i.year == null && !yearlyTitles.has(i.title))];
  }
  const selYear = Number(yearTab);
  const shownItems = resolveYear(selYear);

  function openAdd() {
    // 預設「通用」(多數項目每年皆適用);僅該年適用時於「適用年度」改選年度即可
    setForm({ title: '', description: '', category: 'ONSITE', required: true, year: '' });
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

  // ── 文件範本(僅此處接受 Word/Excel 等可編輯格式;機關端上傳仍限 PDF/圖片)──
  const [uploadingItemId, setUploadingItemId] = useState<string | null>(null);
  const [deletingFile, setDeletingFile] = useState<{ itemId: string; file: TplFile } | null>(null);

  async function uploadTemplate(it: Item, e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    if (f.size > TEMPLATE_UPLOAD_MAX_BYTES) { toast.error('上傳失敗', '檔案超過 20MB 上限'); return; }
    setUploadingItemId(it.id);
    const fd = new FormData();
    fd.append('file', f);
    // 斷網/逾時 fetch 會 throw → 不接住的話 busy 永久卡「上傳中」,故一律回 null 處理
    const res = await fetch(`/api/admin/prep-template/${it.id}/files`, { method: 'POST', body: fd }).catch(() => null);
    setUploadingItemId(null);
    if (!res || !res.ok) {
      const j = res ? await res.json().catch(() => ({})) : {};
      toast.error('上傳失敗', (j as { error?: string }).error ?? '連線逾時或網路中斷,請稍後再試');
      return;
    }
    toast.success('已上傳範本', f.name);
    router.refresh();
  }

  async function removeTemplateFile() {
    if (!deletingFile) return;
    setBusy(true);
    const res = await fetch(`/api/admin/prep-template/${deletingFile.itemId}/files/${deletingFile.file.id}`, { method: 'DELETE' }).catch(() => null);
    setBusy(false);
    setDeletingFile(null);
    if (!res || !res.ok) { toast.error('刪除範本失敗', res ? undefined : '連線逾時或網路中斷,請稍後再試'); return; }
    toast.success('已刪除範本');
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        {/* 年度歷史頁籤:每頁籤=該年度實際帶入的完整清單(通用+該年,同名年度項覆寫);計數=帶入項數 */}
        <Segmented
          value={yearTab}
          onChange={(v) => setYearTab(v)}
          options={allYears.map((y) => ({ value: String(y), label: `${y - 1911} 年度 ${resolveYear(y).length}` }))}
        />
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
      ) : shownItems.length === 0 ? (
        <Card variant="outlined" padded={false}>
          <div className="p-6">
            <EmptyState
              icon={<FileText size={28} />}
              title={`${selYear - 1911} 年度沒有帶入項目`}
              description="此年度既無通用項目、也無年度專屬項目;新增「通用」項目會在每個年度帶入。"
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
                            {/* 來源標示:通用=每年帶入;年度=僅該年;覆寫=同名年度項取代通用項 */}
                            {it.year != null
                              ? <Chip tone="primary" size="sm">{it.year - 1911} 年度{genericTitles.has(it.title) ? '・覆寫通用' : ''}</Chip>
                              : <Chip tone="neutral" size="sm">通用</Chip>}
                            {!it.required && <Chip tone="neutral" size="sm">選附</Chip>}
                          </div>
                          {it.description && (
                            <p className="mt-1 text-body-sm text-on-surface-variant leading-relaxed">{it.description}</p>
                          )}
                          {/* 文件範本:僅此處可上傳 Word/Excel 等;機關於「稽核前資料準備」頁整包下載 */}
                          <div className="mt-2 flex flex-col gap-1">
                            {it.files.map((f) => (
                              <div key={f.id} className="flex items-center gap-2 text-caption min-w-0">
                                <FileText size={13} className="shrink-0 text-on-surface-variant" />
                                <a href={`/api/prep-template-files/${f.id}/download`} className="text-primary-700 hover:underline truncate">
                                  {f.originalName}
                                </a>
                                <span className="text-on-surface-variant shrink-0 tabular-nums">{fmtSize(f.sizeBytes)}</span>
                                <button
                                  type="button"
                                  onClick={() => setDeletingFile({ itemId: it.id, file: f })}
                                  className="shrink-0 text-on-surface-variant hover:text-danger-700 focus-ring rounded-sm px-1"
                                >
                                  刪除
                                </button>
                              </div>
                            ))}
                            <div>
                              <FileUploadButton
                                size="sm"
                                label={it.files.length ? '+ 再上傳範本' : '+ 上傳文件範本(Word/Excel 等)'}
                                busy={uploadingItemId === it.id}
                                onChange={(e) => uploadTemplate(it, e)}
                                accept={TEMPLATE_UPLOAD_ACCEPT}
                              />
                            </div>
                          </div>
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
            {allYears.map((y) => (
              <option key={y} value={String(y)}>{y - 1911} 年度(僅該年帶入;同名可覆寫通用項)</option>
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
        open={deletingFile !== null}
        onOpenChange={(o) => !busy && !o && setDeletingFile(null)}
        title="刪除文件範本"
        description={deletingFile ? `確定刪除範本檔「${deletingFile.file.originalName}」?機關端將無法再下載此範本(已下載者不受影響)。` : undefined}
        confirmLabel="刪除"
        tone="danger"
        onConfirm={removeTemplateFile}
        loading={busy}
      />

      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(o) => !busy && !o && setDeleting(null)}
        title="刪除標準清單項目"
        description={deleting
          ? (deleting.year == null
              ? `「${deleting.title}」為通用項目,每年都會帶入;刪除將影響所有年度(不影響已開立週期既有的項目)。`
              : `「${deleting.title}」為 ${deleting.year - 1911} 年度專屬項目(不影響已開立週期既有的項目)。`)
            + (deleting.files.length > 0 ? `其 ${deleting.files.length} 個文件範本將一併刪除。` : '')
            + '確定刪除?'
          : undefined}
        confirmLabel="刪除"
        tone="danger"
        onConfirm={() => { if (deleting) remove(deleting); }}
        loading={busy}
      />
    </div>
  );
}
