'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/Button';
import { ConfirmDialog, Dialog } from '@/components/ui/Dialog';
import { Select } from '@/components/ui/Select';
import { Textarea } from '@/components/ui/Textarea';
import { useToast } from '@/components/ui/Toast';
import { copyText } from '@/lib/clipboard';
import { ROLE_LABELS, type Role } from '@/lib/types';

/** 使用者列操作:停用/啟用、變更角色(不可操作自己,後端另有最後管理員防呆)。 */
export default function UserRowActions({
  userId,
  name,
  role,
  isActive,
  hasOrganization,
  isSelf,
}: {
  userId: string;
  name: string;
  role: Role;
  isActive: boolean;
  hasOrganization: boolean;
  isSelf: boolean;
}) {
  const router = useRouter();
  const toast = useToast();
  const [toggleOpen, setToggleOpen] = useState(false);
  const [roleOpen, setRoleOpen] = useState(false);
  const [newRole, setNewRole] = useState<Role>(role);
  const [reason, setReason] = useState('');
  const [reasonErr, setReasonErr] = useState<string | undefined>();
  const [saving, setSaving] = useState(false);
  const [resetOpen, setResetOpen] = useState(false);
  const [resetLink, setResetLink] = useState('');
  const [resetDelivered, setResetDelivered] = useState(false);
  const [resetBusy, setResetBusy] = useState(false);

  if (isSelf) {
    return <span className="text-caption text-on-surface-variant">本人</span>;
  }

  async function patch(data: { isActive?: boolean; role?: Role; reason?: string }, okMsg: string) {
    setSaving(true);
    const res = await fetch(`/api/admin/users/${userId}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(data),
    });
    setSaving(false);
    if (!res.ok) {
      const j = await res.json().catch(() => ({ error: '操作失敗' }));
      toast.error('操作失敗', j.error);
      return false;
    }
    toast.success(okMsg, name);
    router.refresh();
    return true;
  }

  async function sendReset() {
    setResetBusy(true);
    const res = await fetch(`/api/admin/users/${userId}/reset-password`, { method: 'POST' });
    setResetBusy(false);
    if (!res.ok) {
      const j = await res.json().catch(() => ({ error: '產生重設連結失敗' }));
      toast.error('操作失敗', j.error);
      return;
    }
    const j = await res.json();
    setResetLink(j.link ?? '');
    setResetDelivered(!!j.delivered);
    setResetOpen(true);
  }

  const roleOptions: Role[] = hasOrganization
    ? ['ORG_ADMIN', 'AUDITOR', 'SUPER_ADMIN']
    : ['AUDITOR', 'SUPER_ADMIN'];

  return (
    <>
      <div className="flex items-center justify-end gap-1">
        <Button size="sm" variant="text" onClick={() => { setNewRole(role); setRoleOpen(true); }}>
          改角色
        </Button>
        {isActive && (
          <Button size="sm" variant="text" onClick={sendReset} disabled={resetBusy}>
            重設密碼
          </Button>
        )}
        <Button
          size="sm"
          variant="text"
          className={isActive ? 'text-danger-600' : 'text-success-700'}
          onClick={() => { setReason(''); setReasonErr(undefined); setToggleOpen(true); }}
        >
          {isActive ? '停用' : '啟用'}
        </Button>
      </div>

      {isActive ? (
        <Dialog
          open={toggleOpen}
          onOpenChange={(o) => !saving && setToggleOpen(o)}
          title="停用帳號"
          description={`停用後「${name}」將無法登入系統;歷史紀錄保留。權責分立要求須填寫停用理由,並留存操作者與時間。`}
          footer={
            <>
              <Button variant="text" onClick={() => setToggleOpen(false)} disabled={saving}>取消</Button>
              <Button
                variant="danger"
                loading={saving}
                onClick={async () => {
                  const r = reason.trim();
                  if (!r) { setReasonErr('請填寫停用理由'); return; }
                  if (await patch({ isActive: false, reason: r }, '已停用帳號')) setToggleOpen(false);
                }}
              >
                停用
              </Button>
            </>
          }
        >
          <Textarea
            label="停用理由"
            placeholder="例:人員離職、職務調整、帳號疑似遭冒用…"
            value={reason}
            onChange={(e) => { setReason(e.target.value); if (reasonErr) setReasonErr(undefined); }}
            errorText={reasonErr}
            rows={3}
            maxLength={500}
          />
        </Dialog>
      ) : (
        <ConfirmDialog
          open={toggleOpen}
          onOpenChange={(o) => !saving && setToggleOpen(o)}
          title="啟用帳號"
          description={`確定重新啟用「${name}」的帳號?`}
          confirmLabel="啟用"
          tone="primary"
          onConfirm={async () => {
            if (await patch({ isActive: true }, '已啟用帳號')) setToggleOpen(false);
          }}
          loading={saving}
        />
      )}

      <Dialog
        open={roleOpen}
        onOpenChange={(v) => !saving && setRoleOpen(v)}
        title="變更角色"
        description={`調整「${name}」的系統角色;權限立即生效。`}
        footer={
          <>
            <Button variant="text" onClick={() => setRoleOpen(false)} disabled={saving}>取消</Button>
            <Button
              loading={saving}
              onClick={async () => {
                if (newRole === role) { setRoleOpen(false); return; }
                if (await patch({ role: newRole }, '已變更角色')) setRoleOpen(false);
              }}
            >
              儲存
            </Button>
          </>
        }
      >
        <div className="pt-2">
          <Select label="角色" value={newRole} onChange={(e) => setNewRole(e.target.value as Role)}>
            {roleOptions.map((r) => (
              <option key={r} value={r}>{ROLE_LABELS[r]}</option>
            ))}
          </Select>
          {!hasOrganization && (
            <p className="mt-1.5 text-caption text-on-surface-variant">
              此帳號未隸屬機關,不可改為機關管理員。
            </p>
          )}
        </div>
      </Dialog>

      <Dialog
        open={resetOpen}
        onOpenChange={setResetOpen}
        title={`重設「${name}」的密碼`}
        description={
          resetDelivered
            ? '已寄出密碼重設連結至該使用者 Email(24 小時內有效)。如未收到,可複製下方連結另行轉交。'
            : 'Email 未實際寄出(未設定寄信服務);請複製下方連結,以其他管道轉交該使用者(24 小時內有效)。'
        }
        footer={<Button onClick={() => setResetOpen(false)}>關閉</Button>}
      >
        <div className="flex flex-col gap-2 pt-2">
          <div className="flex items-center gap-2">
            <input
              readOnly
              value={resetLink}
              onFocus={(e) => e.currentTarget.select()}
              className="flex-1 min-w-0 rounded-md border border-outline-variant bg-surface-container px-3 py-2 text-caption font-mono"
            />
            <Button
              size="sm"
              variant="tonal"
              onClick={async () => {
                if (await copyText(resetLink)) toast.success('已複製連結');
                else toast.error('複製失敗', '請長按或反白連結文字手動複製');
              }}
            >
              複製
            </Button>
          </div>
          <p className="text-caption text-on-surface-variant">此連結單次使用、24 小時內有效;使用者設定新密碼後即失效。</p>
        </div>
      </Dialog>
    </>
  );
}
