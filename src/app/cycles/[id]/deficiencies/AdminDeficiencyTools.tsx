'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { Textarea } from '@/components/ui/Textarea';
import { TextField } from '@/components/ui/TextField';
import { Select } from '@/components/ui/Select';
import { useToast } from '@/components/ui/Toast';
import { Plus, Upload } from '@/components/icons';
import {
  DEFICIENCY_ASPECTS,
  DEFICIENCY_TYPES,
  DEFICIENCY_ASPECT_LABELS,
  DEFICIENCY_TYPE_LABELS,
} from '@/lib/types';
import { TOAST } from '@/lib/copy';

type Preview = { aspect: string; type: string; itemNo: number; description: string; checklistRef?: string };

export default function AdminDeficiencyTools({
  cycleId,
  cycleStatus,
}: {
  cycleId: string;
  cycleStatus: string;
}) {
  const router = useRouter();
  const toast = useToast();

  // ── 新增缺失 ──
  const [createOpen, setCreateOpen] = useState(false);
  const [aspect, setAspect] = useState<string>('STRATEGY');
  const [type, setType] = useState<string>('IMPROVE');
  const [description, setDescription] = useState('');
  const [checklistRef, setChecklistRef] = useState('');
  const [saving, setSaving] = useState(false);

  async function create() {
    if (description.trim().length < 10) {
      toast.error('內容太短', '缺失描述至少 10 字');
      return;
    }
    setSaving(true);
    const res = await fetch(`/api/cycles/${cycleId}/deficiencies`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        aspect,
        type,
        description: description.trim(),
        checklistRef: checklistRef.trim() || undefined,
      }),
    });
    setSaving(false);
    if (!res.ok) {
      const j = await res.json().catch(() => ({ error: '建立失敗' }));
      toast.error('建立失敗', j.error);
      return;
    }
    const t = TOAST.createdDeficiency();
    toast.success(t.title, t.description);
    setDescription('');
    setChecklistRef('');
    setCreateOpen(false);
    router.refresh();
  }

  // ── Excel 匯入 ──
  const [importOpen, setImportOpen] = useState(false);
  const [preview, setPreview] = useState<Preview[] | null>(null);
  const [importing, setImporting] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const [pickedFile, setPickedFile] = useState<File | null>(null);

  async function pickFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    setPickedFile(f);
    setImporting(true);
    const fd = new FormData();
    fd.append('file', f);
    const res = await fetch(`/api/cycles/${cycleId}/deficiencies/import?dryRun=1`, {
      method: 'POST',
      body: fd,
    });
    setImporting(false);
    if (!res.ok) {
      const j = await res.json().catch(() => ({ error: '解析失敗' }));
      toast.error('解析失敗', j.error);
      setPickedFile(null);
      e.target.value = '';
      return;
    }
    const j = await res.json();
    setPreview(j.preview ?? []);
  }

  async function confirmImport() {
    if (!pickedFile) return;
    setImporting(true);
    const fd = new FormData();
    fd.append('file', pickedFile);
    const res = await fetch(`/api/cycles/${cycleId}/deficiencies/import`, {
      method: 'POST',
      body: fd,
    });
    setImporting(false);
    if (!res.ok) {
      const j = await res.json().catch(() => ({ error: '匯入失敗' }));
      toast.error('匯入失敗', j.error);
      return;
    }
    const j = await res.json();
    const t = TOAST.importedDeficiencies(j.created ?? 0);
    toast.success(t.title, t.description);
    closeImport();
    router.refresh();
  }

  function closeImport() {
    setImportOpen(false);
    setPreview(null);
    setPickedFile(null);
    if (fileRef.current) fileRef.current.value = '';
  }

  return (
    <div className="flex gap-2 flex-wrap">
      <Button size="sm" variant="tonal" onClick={() => setImportOpen(true)} leadingIcon={<Upload size={15} />}>
        Excel 匯入
      </Button>
      <Button size="sm" onClick={() => setCreateOpen(true)} leadingIcon={<Plus size={15} />}>
        新增缺失
      </Button>

      {/* 新增 dialog */}
      <Dialog
        open={createOpen}
        onOpenChange={(v) => !saving && setCreateOpen(v)}
        title="新增缺失"
        description="逐筆建立稽核缺失；機關開始填報後即不可再編輯。"
        footer={
          <>
            <Button variant="text" onClick={() => setCreateOpen(false)} disabled={saving}>取消</Button>
            <Button onClick={create} loading={saving}>建立</Button>
          </>
        }
      >
        <div className="flex flex-col gap-4 pt-2">
          <div className="grid grid-cols-2 gap-3">
            <Select label="構面" value={aspect} onChange={(e) => setAspect(e.target.value)}>
              {DEFICIENCY_ASPECTS.map((a) => (
                <option key={a} value={a}>{DEFICIENCY_ASPECT_LABELS[a]}</option>
              ))}
            </Select>
            <Select label="類型" value={type} onChange={(e) => setType(e.target.value)}>
              {DEFICIENCY_TYPES.map((t) => (
                <option key={t} value={t}>{DEFICIENCY_TYPE_LABELS[t]}</option>
              ))}
            </Select>
          </div>
          <Textarea
            label="缺失描述（含法源依據）"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={6}
            placeholder="例：依資通安全責任等級分級辦法資通系統防護基準規定，應保留日誌至少 6 個月。查機關…，應改善之。"
          />
          <TextField
            label="檢核項參照（選填）"
            value={checklistRef}
            onChange={(e) => setChecklistRef(e.target.value)}
            placeholder="例：9.10"
          />
        </div>
      </Dialog>

      {/* 匯入 dialog */}
      <Dialog
        open={importOpen}
        onOpenChange={(v) => !importing && (v ? setImportOpen(true) : closeImport())}
        title="Excel 匯入缺失"
        description="支援教育部「資通安全稽核改善暨執行情形報告」範本格式；先預覽再確認寫入。"
        footer={
          <>
            <Button variant="text" onClick={closeImport} disabled={importing}>取消</Button>
            <Button onClick={confirmImport} loading={importing} disabled={!preview || preview.length === 0}>
              確認匯入{preview ? `（${preview.length} 筆）` : ''}
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-4 pt-2">
          <label className="inline-flex items-center gap-2 h-12 px-4 rounded-md bg-paper-sunk border border-dashed border-primary-400 text-primary-700 hover:bg-primary-50 cursor-pointer focus-ring transition-colors w-fit">
            <input
              ref={fileRef}
              type="file"
              accept=".xlsx"
              className="hidden"
              onChange={pickFile}
              disabled={importing}
            />
            <Upload size={16} />
            <span className="text-body-sm">
              {pickedFile ? pickedFile.name : '選擇 .xlsx 檔案'}
            </span>
          </label>

          {preview && (
            <div className="max-h-72 overflow-y-auto rounded-md border border-rule">
              {preview.length === 0 ? (
                <p className="p-4 text-body-sm text-ink-500">未解析到缺失</p>
              ) : (
                <ul className="divide-y divide-rule">
                  {preview.map((p, i) => (
                    <li key={i} className="p-3">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-caption font-medium text-primary-700">
                          {DEFICIENCY_ASPECT_LABELS[p.aspect as keyof typeof DEFICIENCY_ASPECT_LABELS] ?? p.aspect}
                        </span>
                        <span className="text-caption text-ink-500">
                          {DEFICIENCY_TYPE_LABELS[p.type as keyof typeof DEFICIENCY_TYPE_LABELS] ?? p.type}
                          {' '}#{p.itemNo}
                        </span>
                        {p.checklistRef && (
                          <span className="text-caption font-mono text-ink-500">({p.checklistRef})</span>
                        )}
                      </div>
                      <p className="text-body-sm text-ink-900 line-clamp-2">{p.description}</p>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
      </Dialog>
    </div>
  );
}
