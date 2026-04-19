'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { TextField } from '@/components/ui/TextField';
import { Select } from '@/components/ui/Select';
import { useToast } from '@/components/ui/Toast';
import { Plus } from '@/components/icons';

export default function CreateCycleButton({
  orgId,
  orgName,
  versions,
}: {
  orgId: string;
  orgName: string;
  versions: { id: string; year: number; name: string }[];
}) {
  const router = useRouter();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [versionId, setVersionId] = useState(versions[0]?.id ?? '');
  const [year, setYear] = useState(String(new Date().getFullYear()));
  const [dueDate, setDueDate] = useState(() => {
    const d = new Date();
    d.setMonth(d.getMonth() + 2);
    return d.toISOString().slice(0, 10);
  });
  const [notify, setNotify] = useState(false);
  const [saving, setSaving] = useState(false);

  async function submit() {
    if (!versionId || !year || !dueDate) {
      toast.error('請完整填寫');
      return;
    }
    setSaving(true);
    const res = await fetch('/api/admin/cycles', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        organizationId: orgId,
        year: Number(year),
        checklistVersionId: versionId,
        dueDate,
        notify,
      }),
    });
    setSaving(false);
    if (!res.ok) {
      const j = await res.json().catch(() => ({ error: '建立失敗' }));
      toast.error('建立週期失敗', j.error);
      return;
    }
    toast.success('已建立稽核週期', `${year - 1911} 年度 · ${orgName}`);
    setOpen(false);
    router.refresh();
  }

  return (
    <>
      <Button size="sm" variant="tonal" onClick={() => setOpen(true)} leadingIcon={<Plus size={15} />}>
        建立稽核週期
      </Button>
      <Dialog
        open={open}
        onOpenChange={(v) => !saving && setOpen(v)}
        title="建立稽核週期"
        description={`為 ${orgName} 建立一份年度稽核週期。建立後可選擇是否立刻通知填報人。`}
        footer={
          <>
            <Button variant="text" onClick={() => setOpen(false)} disabled={saving}>取消</Button>
            <Button onClick={submit} loading={saving}>建立</Button>
          </>
        }
      >
        <div className="flex flex-col gap-4 pt-2">
          <Select label="題庫版本" value={versionId} onChange={(e) => setVersionId(e.target.value)}>
            {versions.map((v) => (
              <option key={v.id} value={v.id}>
                {v.year - 1911} 年 · {v.name}
              </option>
            ))}
          </Select>
          <TextField
            label="稽核年度（西元）"
            type="number"
            value={year}
            onChange={(e) => setYear(e.target.value)}
          />
          <TextField
            label="填報截止日"
            type="date"
            value={dueDate}
            onChange={(e) => setDueDate(e.target.value)}
          />
          <label className="inline-flex items-center gap-2 text-body-sm text-on-surface cursor-pointer">
            <input
              type="checkbox"
              checked={notify}
              onChange={(e) => setNotify(e.target.checked)}
              className="accent-primary-600"
            />
            建立後立刻通知該機關填報人 / 主管
          </label>
        </div>
      </Dialog>
    </>
  );
}
