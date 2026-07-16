'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { TextField } from '@/components/ui/TextField';
import { useToast } from '@/components/ui/Toast';
import { Pencil } from '@/components/icons';

/**
 * SUPER_ADMIN 編輯機關資料:全名 / 簡稱。
 * 機關代碼為系統唯一鍵,唯讀顯示不可改(對齊後端 PATCH 只收 name/shortName)。
 */
export default function EditOrgDialog({
  orgId,
  code,
  name,
  shortName,
}: {
  orgId: string;
  code: string;
  name: string;
  shortName: string | null;
}) {
  const router = useRouter();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [nameV, setNameV] = useState(name);
  const [shortV, setShortV] = useState(shortName ?? '');

  async function save() {
    if (!nameV.trim()) { toast.error('請填寫機關全名'); return; }
    setSaving(true);
    const res = await fetch(`/api/admin/organizations/${orgId}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: nameV.trim(), shortName: shortV.trim() }),
    });
    setSaving(false);
    if (!res.ok) {
      const j = await res.json().catch(() => ({ error: '儲存失敗' }));
      toast.error('儲存失敗', j.error);
      return;
    }
    toast.success('機關資料已更新');
    setOpen(false);
    router.refresh();
  }

  return (
    <>
      <Button size="sm" variant="tonal" leadingIcon={<Pencil size={14} />} onClick={() => setOpen(true)}>
        編輯機關資料
      </Button>
      <Dialog
        open={open}
        onOpenChange={(v) => !saving && setOpen(v)}
        title="編輯機關資料"
        description="調整機關全名與簡稱。機關代碼為系統唯一識別，不可於此變更。異動會寫入稽核軌跡。"
        footer={
          <>
            <Button variant="text" onClick={() => setOpen(false)} disabled={saving}>取消</Button>
            <Button onClick={save} loading={saving}>儲存</Button>
          </>
        }
      >
        <div className="flex flex-col gap-4 pt-2">
          <TextField label="機關代碼" value={code} disabled />
          <TextField label="機關全名" value={nameV} onChange={(e) => setNameV(e.target.value)} required />
          <TextField label="簡稱（選填）" value={shortV} onChange={(e) => setShortV(e.target.value)} />
        </div>
      </Dialog>
    </>
  );
}
