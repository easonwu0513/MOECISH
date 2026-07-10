'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/Button';
import { Dialog, ConfirmDialog } from '@/components/ui/Dialog';
import { TextField } from '@/components/ui/TextField';
import { useToast } from '@/components/ui/Toast';
import { Pencil } from '@/components/icons';

function toInput(iso: string | null): string {
  return iso ? iso.slice(0, 10) : '';
}

/** SUPER_ADMIN 編輯週期日期:矯正截止 / 資料準備截止 / 實地稽核日。 */
export default function EditCycleDialog({
  cycleId,
  dueDate,
  prepDueDate,
  prepDueTech,
  techCheckDate,
  onsiteDate,
}: {
  cycleId: string;
  dueDate: string;
  prepDueDate: string | null;
  prepDueTech: string | null;
  techCheckDate: string | null;
  onsiteDate: string | null;
}) {
  const router = useRouter();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [due, setDue] = useState(toInput(dueDate));
  const [prepDue, setPrepDue] = useState(toInput(prepDueDate));
  const [prepTech, setPrepTech] = useState(toInput(prepDueTech));
  const [techDate, setTechDate] = useState(toInput(techCheckDate));
  const [onsite, setOnsite] = useState(toInput(onsiteDate));

  // 「硬日期」(技術檢測日/實地稽核日/技術檢測截止/實地稽核資料截止)若是「修改既有值」(原本已設、現在不同),
  // 會影響受稽機關的繳交安排 → 跳確認;首次設定或只改矯正填報截止則直接存。
  const modifiedHardDates = [
    techDate !== toInput(techCheckDate) && !!toInput(techCheckDate),
    onsite !== toInput(onsiteDate) && !!toInput(onsiteDate),
    prepTech !== toInput(prepDueTech) && !!toInput(prepDueTech),
    prepDue !== toInput(prepDueDate) && !!toInput(prepDueDate),
  ].some(Boolean);

  function attemptSave() {
    if (modifiedHardDates) setConfirmOpen(true);
    else void save();
  }

  async function save() {
    setConfirmOpen(false);
    setSaving(true);
    const res = await fetch(`/api/cycles/${cycleId}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        dueDate: due || null,
        prepDueDate: prepDue || null,
        prepDueTech: prepTech || null,
        techCheckDate: techDate || null,
        onsiteDate: onsite || null,
      }),
    });
    setSaving(false);
    if (!res.ok) {
      const j = await res.json().catch(() => ({ error: '儲存失敗' }));
      toast.error('儲存失敗', j.error);
      return;
    }
    toast.success('週期日期已更新');
    setOpen(false);
    router.refresh();
  }

  return (
    <>
      <Button size="sm" variant="text" leadingIcon={<Pencil size={14} />} onClick={() => setOpen(true)}>
        編輯日期
      </Button>
      <Dialog
        open={open}
        onOpenChange={(v) => !saving && setOpen(v)}
        title="編輯週期日期"
        description="調整實地稽核日、資料準備各區截止與矯正填報截止（展延）。異動會寫入稽核軌跡。"
        footer={
          <>
            <Button variant="text" onClick={() => setOpen(false)} disabled={saving}>取消</Button>
            <Button onClick={attemptSave} loading={saving}>儲存</Button>
          </>
        }
      >
        <div className="flex flex-col gap-4 pt-2">
          <TextField
            label="技術檢測日（選填）"
            type="date"
            value={techDate}
            onChange={(e) => setTechDate(e.target.value)}
          />
          <TextField
            label="實地稽核日（選填）"
            type="date"
            value={onsite}
            onChange={(e) => setOnsite(e.target.value)}
          />
          <TextField
            label="技術檢測資料截止（選填）"
            type="date"
            value={prepTech}
            onChange={(e) => setPrepTech(e.target.value)}
          />
          <TextField
            label="實地稽核資料截止（選填）"
            type="date"
            value={prepDue}
            onChange={(e) => setPrepDue(e.target.value)}
          />
          <p className="-mt-1 text-caption text-ink-500 leading-relaxed">
            中心匯入區資料由中心自行上傳、無機關繳交截止。
          </p>
          <TextField
            label="矯正填報截止（選填）"
            type="date"
            value={due}
            onChange={(e) => setDue(e.target.value)}
          />
          <p className="-mt-1 text-caption text-ink-500 leading-relaxed">
            矯正填報截止建議於實地稽核、發文改善報告給機關後再設定；留空表示尚未確定。
          </p>
        </div>
      </Dialog>

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={(o) => !saving && !o && setConfirmOpen(false)}
        title="修改稽核相關日期？"
        description="您正在修改實地稽核日 / 技術檢測截止 / 實地稽核資料截止，這些會影響受稽機關的資料繳交安排。請先確認已通知受稽機關，再儲存變更（異動會寫入稽核軌跡）。"
        confirmLabel="已通知，確定修改"
        tone="warning"
        onConfirm={save}
        loading={saving}
      />
    </>
  );
}
