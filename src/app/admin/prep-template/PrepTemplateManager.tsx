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
import { FileUploadButton } from '@/components/ui/FileUploadButton';
import { useToast } from '@/components/ui/Toast';
import { Plus, FileText, History, ChevronLeft } from '@/components/icons';
import { PREP_CATEGORY_LABELS, TEMPLATE_UPLOAD_ACCEPT, TEMPLATE_UPLOAD_MAX_BYTES, type PrepCategory } from '@/lib/types';

type TplFile = { id: string; originalName: string; sizeBytes: number };
type Item = { id: string; title: string; description: string | null; category: string; required: boolean; year: number | null; files: TplFile[] };

function fmtSize(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}
const GROUP_ORDER: PrepCategory[] = ['TECH', 'ONSITE', 'CENTER'];

/**
 * 資料準備標準清單(UAT 批70 年度模型重整):
 * - 廢除「通用版本」——每個項目屬於特定年度;每年清單=先「代入上一年度」再小幅修正。
 * - 主畫面=今年清單(可編輯);「歷年清單」= 近五年留存紀錄,唯讀(改今年不會動到歷年)。
 * - 歷年項目可「複製至今年」(單筆/一鍵),連同文件範本檔一起沿用。
 * - year=null 的舊「通用」項已由遷移腳本改為年度項;此處仍向後相容(當作今年帶入)。
 */
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

  const thisYear = new Date().getFullYear();
  const nextYear = thisYear + 1;
  // 編輯頁籤:本年度 / 下一年度(預備)——年底可預先建置明年清單(UAT 批71:先確定今年版本、預新增明年)
  const [editYear, setEditYear] = useState<number>(thisYear);
  // 各編輯年度的清單:今年=今年項+尚未遷移的舊通用項(同名年度項優先,與 getStandardItems 同邏輯,過渡期防禦);
  // 明年(預備)=純明年年度項
  function resolveEditYear(y: number): Item[] {
    const yearly = initialItems.filter((i) => i.year === y);
    if (y !== thisYear) return yearly;
    const yearlyTitles = new Set(yearly.map((i) => i.title));
    return [...yearly, ...initialItems.filter((i) => i.year == null && !yearlyTitles.has(i.title))];
  }
  const currentItems = resolveEditYear(editYear);

  // 歷年清單:近五年留存紀錄(唯讀);只列各年「年度專屬項」=當年凍結的清單
  const histYears = [1, 2, 3, 4, 5].map((d) => thisYear - d);
  const [view, setView] = useState<'current' | 'history'>('current');
  const [histYear, setHistYear] = useState<number>(thisYear - 1);
  const histItems = initialItems.filter((i) => i.year === histYear);
  const isHistory = view === 'history';
  const shownItems = isHistory ? histItems : currentItems;

  // 編輯年度為空時的「代入前一年度」引導(今年空→代入去年留存;明年空→代入本年度)
  const prevOfEdit = resolveEditYear(editYear - 1);

  // 複製到某編輯年度:單筆 / 整年 / 代入前一年;後端冪等(目標年已有同名年度項則跳過)+ Serializable 交易防並行同名
  const [copying, setCopying] = useState<string | null>(null); // item id 或 'all' 或 'seed-prev'
  async function copyToYear(ids: string[], targetYear: number, key: string) {
    if (ids.length === 0) { toast.info('沒有可複製的項目', '來源年度沒有留存的清單項目。'); return; }
    setCopying(key);
    const res = await fetch('/api/admin/prep-template/copy-to-year', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ itemIds: ids, targetYear }),
    }).catch(() => null);
    setCopying(null);
    if (!res || !res.ok) {
      const j = res ? await res.json().catch(() => ({})) : {};
      toast.error('複製失敗', (j as { error?: string }).error ?? '連線逾時,請稍後再試');
      return;
    }
    const r = (await res.json()) as { copied: number; skippedTitles: string[]; fileCopied: number; fileErrors: number };
    const detail = [
      r.fileCopied > 0 ? `含 ${r.fileCopied} 個文件範本` : null,
      r.skippedTitles.length > 0 ? `${r.skippedTitles.length} 項因目標年度已有同名而跳過` : null,
      r.fileErrors > 0 ? `${r.fileErrors} 個範本檔複製失敗(來源檔遺失),請於目標年度清單補上傳` : null,
    ].filter(Boolean).join(';') || undefined;
    if (r.copied === 0 && r.skippedTitles.length > 0) {
      toast.info('未複製任何項目', `${targetYear - 1911} 年度已有同名項目:${r.skippedTitles.slice(0, 3).join('、')}${r.skippedTitles.length > 3 ? '…' : ''}`);
    } else if (r.fileErrors > 0) {
      // 有範本檔複製失敗:用 warning(role=alert)而非綠色成功,失敗訊息不埋在成功 toast 裡
      toast.warning(`已複製 ${r.copied} 項,但部分範本檔失敗`, detail);
    } else {
      toast.success(`已複製 ${r.copied} 項至 ${targetYear - 1911} 年度`, detail);
    }
    if (r.copied > 0) {
      setView('current');
      setEditYear(targetYear === nextYear ? nextYear : thisYear);
    }
    router.refresh();
  }

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
        // 廢除通用:新增綁「目前編輯年度」(本年度或下一年度預備);編輯不動年度
        ...(editing ? {} : { year: editYear }),
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
      {/* 標頭列:今年檢視=標題+歷年清單/新增;歷年檢視=返回+年度頁籤+一鍵複製 */}
      {!isHistory ? (
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2 flex-wrap">
            {/* 本年度=當年確定版本(翌年轉唯讀留存);下一年度=年底預先建置(UAT 批71) */}
            <Segmented
              value={String(editYear)}
              onChange={(v) => setEditYear(Number(v))}
              options={[
                { value: String(thisYear), label: `${thisYear - 1911} 年度(本年度)${resolveEditYear(thisYear).length}` },
                { value: String(nextYear), label: `${nextYear - 1911} 年度(預備)${resolveEditYear(nextYear).length}` },
              ]}
            />
          </div>
          <div className="flex items-center gap-2">
            <Button size="sm" variant="tonal" leadingIcon={<History size={15} />} onClick={() => setView('history')}>
              歷年清單
            </Button>
            <Button size="sm" leadingIcon={<Plus size={15} />} onClick={openAdd}>新增項目</Button>
          </div>
        </div>
      ) : (
        <>
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-3 flex-wrap">
              <Button size="sm" variant="text" leadingIcon={<ChevronLeft size={15} />} onClick={() => setView('current')}>
                返回本年度
              </Button>
              {/* 近五年留存紀錄頁籤 */}
              <Segmented
                value={String(histYear)}
                onChange={(v) => setHistYear(Number(v))}
                options={histYears.map((y) => ({
                  value: String(y),
                  label: `${y - 1911} 年度 ${initialItems.filter((i) => i.year === y).length}`,
                }))}
              />
            </div>
            <Button
              size="sm"
              variant="tonal"
              loading={copying === 'all'}
              // 任一複製在途即鎖全部複製鈕:單筆與一鍵並行會撞同名 TOCTOU(後端交易為權威閘,此為第一道)
              disabled={copying !== null || histItems.length === 0}
              onClick={() => copyToYear(histItems.map((i) => i.id), thisYear, 'all')}
            >
              一鍵複製 {histYear - 1911} 年度清單至今年({histItems.length})
            </Button>
          </div>
          {/* 歷年=唯讀留存紀錄:改今年不會動到這裡;沿用舊範本用「複製至今年」 */}
          <div className="rounded-md border border-primary-100 bg-primary-50/60 px-4 py-3 text-body-sm text-on-surface-variant leading-relaxed">
            <span className="font-medium text-primary-800">歷年清單為留存紀錄(唯讀)</span>
            ——保存近五年各年度的清單與文件範本,僅供檢閱與下載,不可編輯或刪除。
            每年度的清單請以「複製至今年」代入後,於本年度清單小幅修正;修改今年不會動到歷年紀錄。
          </div>
        </>
      )}

      {shownItems.length === 0 ? (
        <Card variant="outlined" padded={false}>
          <div className="p-6">
            <EmptyState
              icon={<FileText size={28} />}
              title={isHistory ? `${histYear - 1911} 年度沒有留存清單` : `${editYear - 1911} 年度清單尚為空`}
              description={
                isHistory
                  ? '該年度沒有留存的清單項目(年度化留存自建立年度項起累積)。歷年清單為唯讀;要新增項目請返回本年度。'
                  : prevOfEdit.length > 0
                    ? '每年清單通常先代入前一年度再小幅修正;按下方按鈕一鍵帶入(含文件範本),或逐項新增。'
                    : '新增項目後,各週期「套用標準清單」會帶入該年度清單;清單為空時帶入系統內建預設。'
              }
            />
            {!isHistory && prevOfEdit.length > 0 && (
              <div className="mt-2 flex justify-center pb-2">
                <Button
                  variant="tonal"
                  loading={copying === 'seed-prev'}
                  disabled={copying !== null}
                  onClick={() => copyToYear(prevOfEdit.map((i) => i.id), editYear, 'seed-prev')}
                >
                  代入 {editYear - 1 - 1911} 年度清單({prevOfEdit.length} 項,含文件範本)
                </Button>
              </div>
            )}
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
                            {!it.required && <Chip tone="neutral" size="sm">選附</Chip>}
                          </div>
                          {it.description && (
                            <p className="mt-1 text-body-sm text-on-surface-variant leading-relaxed">{it.description}</p>
                          )}
                          {/* 文件範本:僅此處可上傳 Word/Excel 等;機關於「稽核前資料準備」頁整包下載。
                              歷年檢視唯讀:保留下載,拔除刪除/上傳 */}
                          <div className="mt-2 flex flex-col gap-1">
                            {it.files.map((f) => (
                              <div key={f.id} className="flex items-center gap-2 text-caption min-w-0">
                                <FileText size={13} className="shrink-0 text-on-surface-variant" />
                                <a href={`/api/prep-template-files/${f.id}/download`} className="text-primary-700 hover:underline truncate">
                                  {f.originalName}
                                </a>
                                <span className="text-on-surface-variant shrink-0 tabular-nums">{fmtSize(f.sizeBytes)}</span>
                                {!isHistory && (
                                  <button
                                    type="button"
                                    onClick={() => setDeletingFile({ itemId: it.id, file: f })}
                                    className="shrink-0 text-on-surface-variant hover:text-danger-700 focus-ring rounded-sm px-1"
                                  >
                                    刪除
                                  </button>
                                )}
                              </div>
                            ))}
                            {!isHistory && (
                              <div>
                                <FileUploadButton
                                  size="sm"
                                  label={it.files.length ? '+ 再上傳範本' : '+ 上傳文件範本(Word/Excel 等)'}
                                  busy={uploadingItemId === it.id}
                                  onChange={(e) => uploadTemplate(it, e)}
                                  accept={TEMPLATE_UPLOAD_ACCEPT}
                                />
                              </div>
                            )}
                          </div>
                        </div>
                        <div className="flex gap-2 shrink-0 items-center">
                          {isHistory ? (
                            <Button
                              size="sm"
                              variant="tonal"
                              loading={copying === it.id}
                              disabled={copying !== null}
                              onClick={() => copyToYear([it.id], thisYear, it.id)}
                            >
                              複製至今年
                            </Button>
                          ) : (
                            <>
                              <Button size="sm" variant="ghost" onClick={() => openEdit(it)}>編輯</Button>
                              <Button size="sm" variant="text" onClick={() => setDeleting(it)}>刪除</Button>
                            </>
                          )}
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
        title={editing ? '編輯標準清單項目' : `新增標準清單項目(${editYear - 1911} 年度)`}
        description={`分區決定此項落在哪一繳交區(中心匯入由中心上傳);項目屬 ${editYear - 1911} 年度清單,不影響歷年留存紀錄。`}
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
          ? `「${deleting.title}」將自 ${editYear - 1911} 年度清單移除,之後套用標準清單不再帶入(不影響已開立週期與歷年留存)。`
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
