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
 * 統一邀請對話框:三種角色單一入口(取代原 GlobalInvitePanel + 醫院頁 InvitePanel 兩套重複元件)。
 * 選「機關管理員」時出現必填的所屬醫院下拉;API 本就統一(role↔機關一致性由後端驗證)。
 */
const ROLE_OPTIONS: { value: Role; label: string; hint: string }[] = [
  { value: 'AUDITOR', label: '稽核委員', hint: '外聘委員,不隸屬任何機關' },
  { value: 'OBSERVER', label: '觀察員', hint: '學習與練習定位,獨立審閱窗口,不隸屬任何機關(批30)' },
  { value: 'ORG_ADMIN', label: '機關管理員', hint: '受稽醫院的承辦人,須指定所屬醫院' },
  { value: 'SUPER_ADMIN', label: '最高管理員', hint: '中心人員,具全部權限' },
];

export default function InviteDialog({
  orgs,
  defaultRole = 'AUDITOR',
  defaultOrgId = '',
  lockOrg = false,
  triggerLabel = '邀請人員',
}: {
  /** 可選的所屬醫院清單(機關管理員用) */
  orgs: { id: string; name: string }[];
  defaultRole?: Role;
  defaultOrgId?: string;
  /** 醫院頁進入時鎖定該院(不可改選) */
  lockOrg?: boolean;
  triggerLabel?: string;
}) {
  const router = useRouter();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [role, setRole] = useState<Role>(defaultRole);
  const [orgId, setOrgId] = useState(defaultOrgId);
  const [saving, setSaving] = useState(false);
  const [link, setLink] = useState<string | null>(null);
  const [delivered, setDelivered] = useState(true); // email 是否真的寄出(全掃 P2:未寄時文案誠實切換)

  async function submit() {
    if (!email.trim() || !name.trim()) {
      toast.error('姓名與 email 為必填');
      return;
    }
    if (role === 'ORG_ADMIN' && !orgId) {
      toast.error('請選擇所屬醫院', '機關管理員必須隸屬一間醫院');
      return;
    }
    setSaving(true);
    const res = await fetch('/api/admin/invitations', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        email: email.trim(),
        name: name.trim(),
        role,
        organizationId: role === 'ORG_ADMIN' ? orgId : null,
      }),
    });
    setSaving(false);
    if (!res.ok) {
      const j = await res.json().catch(() => ({ error: '建立邀請失敗' }));
      toast.error('建立邀請失敗', j.error);
      return;
    }
    const j = await res.json();
    setLink(j.link);
    setDelivered(j.delivered !== false);
    if (j.delivered !== false) {
      toast.success('邀請已建立', `系統已寄送邀請信給 ${email}`);
    } else {
      toast.warning('邀請已建立(Email 未寄出)', '寄信服務尚未設定,請複製下方連結直接轉交對方');
    }
    router.refresh();
  }

  function reset() {
    setEmail(''); setName(''); setRole(defaultRole); setOrgId(defaultOrgId);
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
      <Button size="sm" onClick={() => setOpen(true)} leadingIcon={<Plus size={14} />}>
        {triggerLabel}
      </Button>
      <Dialog
        open={open}
        onOpenChange={(v) => {
          if (saving) return;
          setOpen(v);
          if (!v) reset();
        }}
        title={link ? '邀請已建立' : '邀請新人員加入'}
        description={link
          ? (delivered
              ? '邀請信已寄出。你也可以複製以下連結直接傳給對方。'
              : '邀請已建立,但 Email 尚未實際寄出(寄信服務未設定)。請複製以下連結直接傳給對方。')
          : '輸入對方 email、姓名與角色;機關管理員需指定所屬醫院。系統將建立一次性連結並寄送邀請(14 天內有效)。'}
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
            <div className={`flex items-center gap-2 mb-3 ${delivered ? 'text-success-700' : 'text-warning-700'}`}>
              <CheckCircle size={18} />
              <span className="text-body font-medium">{delivered ? '邀請信已寄出' : '邀請已建立(Email 未寄出,請複製連結轉交)'}</span>
            </div>
            <div className="rounded-md bg-paper-sunk border border-rule/60 p-3 mb-3">
              <p className="text-caption text-ink-500 mb-1">邀請連結(14 天內有效)</p>
              <p className="text-body-sm font-mono break-all text-ink-900">{link}</p>
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
              <Select label="角色" value={role} onChange={(e) => setRole(e.target.value as Role)} disabled={lockOrg}>
                {ROLE_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </Select>
              {roleHint && <p className="mt-1.5 text-caption text-ink-500">{roleHint}</p>}
            </div>
            {role === 'ORG_ADMIN' && (
              <Select label="所屬醫院" value={orgId} onChange={(e) => setOrgId(e.target.value)} disabled={lockOrg}>
                <option value="">選擇醫院…</option>
                {orgs.map((o) => (
                  <option key={o.id} value={o.id}>{o.name}</option>
                ))}
              </Select>
            )}
          </div>
        )}
      </Dialog>
    </>
  );
}
