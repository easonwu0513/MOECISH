'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { TextField } from '@/components/ui/TextField';
import { Select } from '@/components/ui/Select';
import { useToast } from '@/components/ui/Toast';
import { Plus } from '@/components/icons';
import { cn } from '@/lib/cn';

type OrgOpt = { id: string; name: string; years: number[] };
type VersionOpt = { id: string; name: string; year: number };

/**
 * 批次開立年度週期精靈:勾選機關 × 年度 × 題庫,一鍵建立(可同時套標準資料準備清單)。
 * 已有該年度週期的機關自動鎖定並標示。
 */
export default function BatchCreateCycles({
  orgs,
  versions,
  defaultYear,
}: {
  orgs: OrgOpt[];
  versions: VersionOpt[];
  defaultYear: number;
}) {
  const router = useRouter();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  const [year, setYear] = useState(String(defaultYear));
  const [versionId, setVersionId] = useState(versions[0]?.id ?? '');
  const [dueDate, setDueDate] = useState('');
  const [prepDueDate, setPrepDueDate] = useState('');
  const [applyPrep, setApplyPrep] = useState(true);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const yearNum = parseInt(year, 10);
  const eligible = useMemo(
    () => orgs.map((o) => ({ ...o, has: !Number.isNaN(yearNum) && o.years.includes(yearNum) })),
    [orgs, yearNum],
  );

  function openDialog() {
    // 預設勾選所有尚未開立該年度的機關
    const init = new Set(
      orgs.filter((o) => !o.years.includes(parseInt(year, 10))).map((o) => o.id),
    );
    setSelected(init);
    setOpen(true);
  }

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function submit() {
    if (Number.isNaN(yearNum)) { toast.error('年度格式有誤'); return; }
    if (!versionId) { toast.error('請選擇題庫版本'); return; }
    if (!dueDate) { toast.error('請設定矯正填報截止日'); return; }
    if (selected.size === 0) { toast.error('請至少勾選一個機關'); return; }
    setSaving(true);
    const res = await fetch('/api/admin/cycles/batch', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        year: yearNum,
        checklistVersionId: versionId,
        organizationIds: Array.from(selected),
        dueDate,
        prepDueDate: prepDueDate || null,
        applyStandardPrep: applyPrep,
      }),
    });
    setSaving(false);
    if (!res.ok) {
      const j = await res.json().catch(() => ({ error: '批次建立失敗' }));
      toast.error('批次建立失敗', j.error);
      return;
    }
    const j = await res.json();
    toast.success(
      `已建立 ${j.created.length} 個週期`,
      j.skipped.length > 0 ? `略過已存在:${j.skipped.join('、')}` : applyPrep ? '已套用標準資料準備清單' : undefined,
    );
    setOpen(false);
    router.refresh();
  }

  return (
    <>
      <Button size="sm" onClick={openDialog} leadingIcon={<Plus size={15} />}>
        批次開立年度週期
      </Button>
      <Dialog
        open={open}
        onOpenChange={(v) => !saving && setOpen(v)}
        title="批次開立年度週期"
        description="勾選機關後一鍵建立該年度週期(狀態為開立中);已有該年度週期的機關會自動略過。"
        footer={
          <>
            <Button variant="text" onClick={() => setOpen(false)} disabled={saving}>取消</Button>
            <Button onClick={submit} loading={saving}>建立 {selected.size} 個週期</Button>
          </>
        }
      >
        <div className="flex flex-col gap-4 pt-2">
          <div className="grid grid-cols-2 gap-3">
            <TextField label="年度(西元)" value={year} onChange={(e) => setYear(e.target.value)} placeholder="2026" />
            <Select label="題庫版本" value={versionId} onChange={(e) => setVersionId(e.target.value)}>
              {versions.map((v) => (
                <option key={v.id} value={v.id}>{v.name}({v.year - 1911} 年度)</option>
              ))}
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <TextField label="矯正填報截止(必填)" type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
            <TextField label="資料準備截止(選填)" type="date" value={prepDueDate} onChange={(e) => setPrepDueDate(e.target.value)} />
          </div>

          <div>
            <p className="text-label text-on-surface mb-2">機關({selected.size} 已選)</p>
            <div className="flex flex-col gap-1 max-h-56 overflow-y-auto rounded-md border border-outline-variant p-2">
              {eligible.map((o) => (
                <label
                  key={o.id}
                  className={cn(
                    'flex items-center gap-2.5 rounded-sm px-2.5 py-2 text-body-sm transition-colors',
                    o.has ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer hover:bg-surface-container',
                  )}
                >
                  <input
                    type="checkbox"
                    className="accent-primary-600"
                    checked={selected.has(o.id)}
                    disabled={o.has}
                    onChange={() => toggle(o.id)}
                  />
                  <span className="flex-1 min-w-0 truncate text-on-surface">{o.name}</span>
                  {o.has && <span className="text-caption text-on-surface-variant shrink-0">已有該年度</span>}
                </label>
              ))}
            </div>
          </div>

          <label className="flex items-center gap-2.5 cursor-pointer text-body-sm text-on-surface">
            <input
              type="checkbox"
              className="accent-primary-600"
              checked={applyPrep}
              onChange={(e) => setApplyPrep(e.target.checked)}
            />
            同時套用標準資料準備清單(6 項)
          </label>
        </div>
      </Dialog>
    </>
  );
}
