'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { TextField } from '@/components/ui/TextField';
import { useToast } from '@/components/ui/Toast';
import { Plus } from '@/components/icons';

export default function CreateOrganizationButton() {
  const router = useRouter();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [shortName, setShortName] = useState('');
  const [saving, setSaving] = useState(false);

  async function submit() {
    if (!code.trim() || !name.trim()) {
      toast.error('代碼與全名為必填');
      return;
    }
    setSaving(true);
    const res = await fetch('/api/admin/organizations', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ code, name, shortName: shortName || undefined }),
    });
    setSaving(false);
    if (!res.ok) {
      const j = await res.json().catch(() => ({ error: '建立失敗' }));
      toast.error('建立失敗', j.error);
      return;
    }
    toast.success('已新增醫院', name);
    setCode(''); setName(''); setShortName('');
    setOpen(false);
    router.refresh();
  }

  return (
    <>
      <Button onClick={() => setOpen(true)} leadingIcon={<Plus size={16} />}>
        新增醫院
      </Button>
      <Dialog
        open={open}
        onOpenChange={(v) => !saving && setOpen(v)}
        title="新增醫院"
        description="建立新的受稽機關。建立後可進入詳細頁邀請填報人員、建立稽核週期。"
        footer={
          <>
            <Button variant="text" onClick={() => setOpen(false)} disabled={saving}>取消</Button>
            <Button onClick={submit} loading={saving}>建立</Button>
          </>
        }
      >
        <div className="flex flex-col gap-4 pt-2">
          <TextField
            label="代碼"
            helperText="如 NTUH-001，英數及連字號"
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
          />
          <TextField
            label="全名"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <TextField
            label="簡稱（選填）"
            value={shortName}
            onChange={(e) => setShortName(e.target.value)}
          />
        </div>
      </Dialog>
    </>
  );
}
