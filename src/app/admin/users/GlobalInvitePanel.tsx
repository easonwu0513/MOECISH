'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { TextField } from '@/components/ui/TextField';
import { Select } from '@/components/ui/Select';
import { useToast } from '@/components/ui/Toast';
import { Plus, Paperclip, CheckCircle } from '@/components/icons';
import { copyText } from '@/lib/clipboard';
import type { Role } from '@/lib/types';

/**
 * 全域邀請:稽核委員(不綁機關)與最高管理員。
 * 機關管理員請走「醫院管理 → 該醫院 → 邀請人員」(需綁機關)。
 */
const ROLE_OPTIONS: { value: Role; label: string; hint: string }[] = [
  { value: 'AUDITOR', label: '稽核委員', hint: '外聘委員,不隸屬任何機關' },
  { value: 'SUPER_ADMIN', label: '最高管理員', hint: '中心人員,具全部權限' },
];

export default function GlobalInvitePanel() {
  const router = useRouter();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [role, setRole] = useState<Role>('AUDITOR');
  const [saving, setSaving] = useState(false);
  const [link, setLink] = useState<string | null>(null);

  async function submit() {
    if (!email.trim() || !name.trim()) {
      toast.error('姓名與 email 為必填');
      return;
    }
    setSaving(true);
    const res = await fetch('/api/admin/invitations', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: email.trim(), name: name.trim(), role, organizationId: null }),
    });
    setSaving(false);
    if (!res.ok) {
      const j = await res.json().catch(() => ({ error: '建立邀請失敗' }));
      toast.error('建立邀請失敗', j.error);
      return;
    }
    const j = await res.json();
    setLink(j.link);
    toast.success('邀請已建立', `系統已寄送邀請信給 ${email}`);
    router.refresh();
  }

  function reset() {
    setEmail(''); setName(''); setRole('AUDITOR');
    setLink(null);
  }

  async function copyLink() {
    if (!link) return;
    if (await copyText(link)) toast.success('已複製邀請連結');
    else toast.error('複製失敗', '請長按或反白連結文字手動複製');
  }

  const roleHint = ROLE_OPTIONS.find((o) => o.value === role)?.hint;

  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)} leadingIcon={<Plus size={15} />}>
        邀請委員 / 管理員
      </Button>
      <Dialog
        open={open}
        onOpenChange={(v) => {
          if (saving) return;
          setOpen(v);
          if (!v) reset();
        }}
        title={link ? '邀請已建立' : '邀請稽核委員或管理員'}
        description={link
          ? '邀請信已寄出。你可以複製以下連結直接傳給對方。'
          : '輸入對方 email、姓名與角色,系統將建立一次性連結並寄送邀請。機關管理員請改至「醫院管理」邀請。'}
        footer={link ? (
          <Button variant="text" onClick={() => { setOpen(false); reset(); }}>關閉</Button>
        ) : (
          <>
            <Button variant="text" onClick={() => setOpen(false)} disabled={saving}>取消</Button>
            <Button onClick={submit} loading={saving}>建立並寄送</Button>
          </>
        )}
      >
        {link ? (
          <div className="pt-2">
            <div className="flex items-center gap-2 mb-3 text-success-700">
              <CheckCircle size={18} />
              <span className="text-body font-medium">邀請信已寄出</span>
            </div>
            <div className="rounded-md bg-surface-container-low border border-outline-variant/60 p-3 mb-3">
              <p className="text-caption text-on-surface-variant mb-1">邀請連結(14 天內有效)</p>
              <p className="text-body-sm font-mono break-all text-on-surface">{link}</p>
            </div>
            <Button variant="tonal" onClick={copyLink} leadingIcon={<Paperclip size={14} />}>
              複製連結
            </Button>
          </div>
        ) : (
          <div className="flex flex-col gap-4 pt-2">
            <TextField label="姓名" value={name} onChange={(e) => setName(e.target.value)} />
            <TextField label="Email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
            <div>
              <Select label="角色" value={role} onChange={(e) => setRole(e.target.value as Role)}>
                {ROLE_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </Select>
              {roleHint && <p className="mt-1.5 text-caption text-on-surface-variant">{roleHint}</p>}
            </div>
          </div>
        )}
      </Dialog>
    </>
  );
}
