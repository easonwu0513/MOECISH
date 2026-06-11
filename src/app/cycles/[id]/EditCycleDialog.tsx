'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
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
  onsiteDate,
}: {
  cycleId: string;
  dueDate: string;
  prepDueDate: string | null;
  onsiteDate: string | null;
}) {
  const router = useRouter();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [due, setDue] = useState(toInput(dueDate));
  const [prepDue, setPrepDue] = useState(toInput(prepDueDate));
  const [onsite, setOnsite] = useState(toInput(onsiteDate));

  async function save() {
    if (!due) {
      toast.error('矯正填報截止日為必填');
      return;
    }
    setSaving(true);
    const res = await fetch(`/api/cycles/${cycleId}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        dueDate: due,
        prepDueDate: prepDue || null,
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
        description="調整實地稽核日、資料準備截止與矯正填報截止(展延)。異動會寫入稽核軌跡。"
        footer={
          <>
            <Button variant="text" onClick={() => setOpen(false)} disabled={saving}>取消</Button>
            <Button onClick={save} loading={saving}>儲存</Button>
          </>
        }
      >
        <div className="flex flex-col gap-4 pt-2">
          <TextField
            label="實地稽核日(選填)"
            type="date"
            value={onsite}
            onChange={(e) => setOnsite(e.target.value)}
          />
          <TextField
            label="資料準備截止(選填)"
            type="date"
            value={prepDue}
            onChange={(e) => setPrepDue(e.target.value)}
          />
          <TextField
            label="矯正填報截止(必填)"
            type="date"
            value={due}
            onChange={(e) => setDue(e.target.value)}
          />
        </div>
      </Dialog>
    </>
  );
}
