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
  const [applyPrep, setApplyPrep] = useState(true);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  // UAT 圖10:每機關各自的實地稽核日期(選填;未填=留空,之後於週期頁再設)
  const [onsiteDates, setOnsiteDates] = useState<Record<string, string>>({});

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
    if (selected.size === 0) { toast.error('請至少勾選一個機關'); return; }
    setSaving(true);
    const res = await fetch('/api/admin/cycles/batch', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        year: yearNum,
        checklistVersionId: versionId,
        // UAT 圖10:每機關附各自的實地稽核日期(未填=null 留空)
        organizations: Array.from(selected).map((id) => ({
          organizationId: id,
          onsiteDate: onsiteDates[id] || null,
        })),
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
      j.skipped.length > 0 ? `略過已存在：${j.skipped.join('、')}` : applyPrep ? '已套用標準資料準備清單' : undefined,
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
        description="勾選機關後一鍵建立該年度週期（狀態為開立中）；已有該年度週期的機關會自動略過。"
        footer={
          <>
            <Button variant="text" onClick={() => setOpen(false)} disabled={saving}>取消</Button>
            <Button onClick={submit} loading={saving}>建立 {selected.size} 個週期</Button>
          </>
        }
      >
        <div className="flex flex-col gap-4 pt-2">
          {/* UAT 圖12:TextField(浮動 label)與 Select(外置 label)高度不同,以 items-end 對齊底線 */}
          <div className="grid grid-cols-2 gap-3 items-end">
            <TextField label="年度（西元）" value={year} onChange={(e) => setYear(e.target.value)} placeholder="2026" />
            <Select label="題庫版本" value={versionId} onChange={(e) => setVersionId(e.target.value)}>
              {versions.map((v) => (
                <option key={v.id} value={v.id}>{v.name}({v.year - 1911} 年度）</option>
              ))}
            </Select>
          </div>

          <div>
            <p className="text-label text-ink-900 mb-2">選擇機關與實地稽核日期（{selected.size} 已選）</p>
            <div className="rounded-md border border-rule">
              <p className="flex items-start gap-1.5 border-b border-rule bg-paper-sunk/50 px-3 py-2 text-caption text-ink-500">
                💡 提示：您可於此處直接為各機關選填實地稽核時間，未填寫者將留空。
              </p>
              <div className="flex flex-col gap-1 max-h-64 overflow-y-auto p-2">
                {eligible.map((o) => (
                  <div
                    key={o.id}
                    className={cn(
                      'flex items-center gap-2.5 rounded-sm px-2.5 py-1.5 text-body-sm transition-colors',
                      o.has ? 'opacity-50' : 'hover:bg-paper-sunk',
                    )}
                  >
                    <label className={cn('flex flex-1 min-w-0 items-center gap-2.5', o.has ? 'cursor-not-allowed' : 'cursor-pointer')}>
                      <input
                        type="checkbox"
                        className="accent-primary-600"
                        checked={selected.has(o.id)}
                        disabled={o.has}
                        onChange={() => toggle(o.id)}
                      />
                      <span className="flex-1 min-w-0 truncate text-ink-900">{o.name}</span>
                      {o.has && <span className="text-caption text-ink-500 shrink-0">已有該年度</span>}
                    </label>
                    {!o.has && (
                      <input
                        type="date"
                        aria-label={`${o.name} 實地稽核日期（選填）`}
                        value={onsiteDates[o.id] ?? ''}
                        onChange={(e) => setOnsiteDates((prev) => ({ ...prev, [o.id]: e.target.value }))}
                        disabled={!selected.has(o.id)}
                        className={cn(
                          'shrink-0 rounded-md border border-rule bg-card px-2.5 py-1.5 text-caption focus-ring',
                          !selected.has(o.id) && 'opacity-40 cursor-not-allowed',
                        )}
                      />
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>

          <label className="flex items-center gap-2.5 cursor-pointer text-body-sm text-ink-900">
            <input
              type="checkbox"
              className="accent-primary-600"
              checked={applyPrep}
              onChange={(e) => setApplyPrep(e.target.checked)}
            />
            同時套用標準資料準備清單（6 項）
          </label>
        </div>
      </Dialog>
    </>
  );
}
