'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/Button';
import { ConfirmDialog, Dialog } from '@/components/ui/Dialog';
import { Select } from '@/components/ui/Select';
import { useToast } from '@/components/ui/Toast';
import type { Role } from '@/lib/types';

const ROLE_LABELS: Record<Role, string> = {
  SUPER_ADMIN: '最高管理員',
  AUDITOR: '稽核委員',
  ORG_ADMIN: '機關管理員',
};

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
  const [saving, setSaving] = useState(false);

  if (isSelf) {
    return <span className="text-caption text-on-surface-variant">本人</span>;
  }

  async function patch(data: { isActive?: boolean; role?: Role }, okMsg: string) {
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

  const roleOptions: Role[] = hasOrganization
    ? ['ORG_ADMIN', 'AUDITOR', 'SUPER_ADMIN']
    : ['AUDITOR', 'SUPER_ADMIN'];

  return (
    <>
      <div className="flex items-center justify-end gap-1">
        <Button size="sm" variant="text" onClick={() => { setNewRole(role); setRoleOpen(true); }}>
          改角色
        </Button>
        <Button
          size="sm"
          variant="text"
          className={isActive ? 'text-danger-600' : 'text-success-700'}
          onClick={() => setToggleOpen(true)}
        >
          {isActive ? '停用' : '啟用'}
        </Button>
      </div>

      <ConfirmDialog
        open={toggleOpen}
        onOpenChange={(o) => !saving && setToggleOpen(o)}
        title={isActive ? '停用帳號' : '啟用帳號'}
        description={
          isActive
            ? `停用後「${name}」將無法登入系統;歷史紀錄保留。確定停用?`
            : `確定重新啟用「${name}」的帳號?`
        }
        confirmLabel={isActive ? '停用' : '啟用'}
        tone={isActive ? 'danger' : 'primary'}
        onConfirm={async () => {
          if (await patch({ isActive: !isActive }, isActive ? '已停用帳號' : '已啟用帳號')) {
            setToggleOpen(false);
          }
        }}
        loading={saving}
      />

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
    </>
  );
}
