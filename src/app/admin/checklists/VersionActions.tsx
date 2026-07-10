'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/Button';
import { ConfirmDialog, Dialog } from '@/components/ui/Dialog';
import { TextField } from '@/components/ui/TextField';
import { useToast } from '@/components/ui/Toast';

/** 題庫版本列操作:啟用/停用、複製為新版本(年度換版)。 */
export default function VersionActions({
  versionId,
  name,
  year,
  isActive,
  cycleCount,
}: {
  versionId: string;
  name: string;
  year: number;
  isActive: boolean;
  cycleCount: number;
}) {
  const router = useRouter();
  const toast = useToast();
  const [toggleOpen, setToggleOpen] = useState(false);
  const [copyOpen, setCopyOpen] = useState(false);
  const [delOpen, setDelOpen] = useState(false);
  const [newName, setNewName] = useState(`${name}(複本)`);
  const [newYear, setNewYear] = useState(String(year + 1));
  const [busy, setBusy] = useState(false);

  async function doDelete() {
    setBusy(true);
    const res = await fetch(`/api/admin/checklist-versions/${versionId}`, { method: 'DELETE' });
    setBusy(false);
    if (!res.ok) {
      const j = await res.json().catch(() => ({ error: '刪除失敗' }));
      toast.error('刪除失敗', j.error);
      return;
    }
    toast.success('已刪除版本', name);
    setDelOpen(false);
    router.refresh();
  }

  async function toggleActive() {
    setBusy(true);
    const res = await fetch(`/api/admin/checklist-versions/${versionId}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ isActive: !isActive }),
    });
    setBusy(false);
    setToggleOpen(false);
    if (!res.ok) {
      const j = await res.json().catch(() => ({ error: '操作失敗' }));
      toast.error('操作失敗', j.error);
      return;
    }
    toast.success(isActive ? '已停用版本' : '已啟用版本', name);
    router.refresh();
  }

  async function copyVersion() {
    const y = parseInt(newYear, 10);
    if (!newName.trim() || Number.isNaN(y)) {
      toast.error('請填寫名稱與年度');
      return;
    }
    setBusy(true);
    const res = await fetch('/api/admin/checklist-versions', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: newName.trim(), year: y, copyFromId: versionId }),
    });
    setBusy(false);
    if (!res.ok) {
      const j = await res.json().catch(() => ({ error: '建立失敗' }));
      toast.error('建立失敗', j.error);
      return;
    }
    const j = await res.json();
    toast.success('已建立新版本', `複製 ${j.copied} 個項目;新版本預設為停用,編修完成後再啟用。`);
    setCopyOpen(false);
    router.refresh();
  }

  return (
    <>
      <div className="flex items-center justify-end gap-1">
        <Button size="sm" variant="text" onClick={() => setCopyOpen(true)}>
          複製為新版
        </Button>
        <Button
          size="sm"
          variant="text"
          className={isActive ? 'text-danger-600' : 'text-success-700'}
          onClick={() => setToggleOpen(true)}
        >
          {isActive ? '停用' : '啟用'}
        </Button>
        {cycleCount === 0 && (
          <Button size="sm" variant="text" className="text-danger-600" onClick={() => setDelOpen(true)}>
            刪除
          </Button>
        )}
      </div>

      <ConfirmDialog
        open={delOpen}
        onOpenChange={(o) => !busy && !o && setDelOpen(false)}
        title="刪除題庫版本"
        description={`將刪除「${name}」及其全部題目(含法規對照),無法復原。確定刪除？`}
        confirmLabel="刪除"
        tone="danger"
        onConfirm={doDelete}
        loading={busy}
      />

      <ConfirmDialog
        open={toggleOpen}
        onOpenChange={(o) => !busy && setToggleOpen(o)}
        title={isActive ? '停用題庫版本' : '啟用題庫版本'}
        description={
          isActive
            ? '停用後開立新週期時將不可選用此版本;既有週期不受影響。'
            : '啟用後開立新週期時即可選用此版本。'
        }
        confirmLabel={isActive ? '停用' : '啟用'}
        tone={isActive ? 'danger' : 'primary'}
        onConfirm={toggleActive}
        loading={busy}
      />

      <Dialog
        open={copyOpen}
        onOpenChange={(v) => !busy && setCopyOpen(v)}
        title="複製為新版本"
        description="複製全部項目(含法規對照)為新版本;歷史週期仍綁定原版本,互不影響。"
        footer={
          <>
            <Button variant="text" onClick={() => setCopyOpen(false)} disabled={busy}>取消</Button>
            <Button onClick={copyVersion} loading={busy}>建立</Button>
          </>
        }
      >
        <div className="flex flex-col gap-4 pt-2">
          <TextField label="新版本名稱" value={newName} onChange={(e) => setNewName(e.target.value)} />
          <TextField label="年度(西元)" value={newYear} onChange={(e) => setNewYear(e.target.value)} />
        </div>
      </Dialog>
    </>
  );
}
