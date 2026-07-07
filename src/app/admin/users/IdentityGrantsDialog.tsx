'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { Select } from '@/components/ui/Select';
import { Chip } from '@/components/ui/Chip';
import { useToast } from '@/components/ui/Toast';
import { ROLE_LABELS, ROLE_TONE, type Role } from '@/lib/types';

type IdentityDTO = {
  role: Role;
  organizationId: string | null;
  organizationName: string | null;
  grantId?: string;
  current: boolean;
};

/**
 * 身分授權管理(批31/方案A;中心):同一帳號可授予多重身分(如機關管理員+觀察員+委員),
 * 使用者於右上選單自行切換「現用身分」。收回不硬刪(留歷史);唯一身分不可收回。
 * 新增授權限 ORG_ADMIN/AUDITOR/OBSERVER(最高管理員仍走「改角色」,縮小提權面)。
 */
export default function IdentityGrantsDialog({
  userId,
  name,
  open,
  onOpenChange,
  orgs,
}: {
  userId: string;
  name: string;
  open: boolean;
  onOpenChange: (o: boolean) => void;
  orgs: { id: string; name: string }[];
}) {
  const router = useRouter();
  const toast = useToast();
  const [identities, setIdentities] = useState<IdentityDTO[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [addRole, setAddRole] = useState<'ORG_ADMIN' | 'AUDITOR' | 'OBSERVER'>('OBSERVER');
  const [addOrg, setAddOrg] = useState('');

  async function load() {
    const res = await fetch(`/api/admin/users/${userId}/roles`);
    if (!res.ok) return;
    const j = await res.json();
    setIdentities(j.identities ?? []);
  }
  useEffect(() => {
    if (open) void load();
    else setIdentities(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, userId]);

  async function addGrant() {
    if (addRole === 'ORG_ADMIN' && !addOrg) {
      toast.error('請選擇機關', '機關管理員授權須指定機關。');
      return;
    }
    setBusy(true);
    const res = await fetch(`/api/admin/users/${userId}/roles`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ role: addRole, organizationId: addRole === 'ORG_ADMIN' ? addOrg : undefined }),
    });
    setBusy(false);
    if (!res.ok) {
      const j = await res.json().catch(() => ({ error: '授予失敗' }));
      toast.error('授予失敗', j.error);
      return;
    }
    toast.success('已授予身分', `${name} 可於右上選單切換身分。`);
    await load();
    router.refresh();
  }

  async function endGrant(grantId: string) {
    setBusy(true);
    const res = await fetch(`/api/admin/users/${userId}/roles?grantId=${grantId}`, { method: 'DELETE' });
    setBusy(false);
    if (!res.ok) {
      const j = await res.json().catch(() => ({ error: '收回失敗' }));
      toast.error('收回失敗', j.error);
      return;
    }
    toast.success('已收回身分授權');
    await load();
    router.refresh();
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => !busy && onOpenChange(o)}
      title={`身分授權 — ${name}`}
      description="此帳號可持有多重身分(使用者於右上選單切換);收回留歷史、唯一身分不可收回。"
      footer={<Button variant="text" onClick={() => onOpenChange(false)} disabled={busy}>關閉</Button>}
    >
      <div className="flex flex-col gap-4">
        <div className="rounded-md border border-rule divide-y divide-rule">
          {identities === null ? (
            <p className="px-4 py-3 text-body-sm text-ink-500">載入中…</p>
          ) : (
            identities.map((it) => (
              <div key={`${it.role}:${it.organizationId ?? ''}`} className="flex items-center gap-2.5 px-4 py-2.5">
                <Chip size="sm" tone={ROLE_TONE[it.role]}>{ROLE_LABELS[it.role]}</Chip>
                <span className="min-w-0 flex-1 truncate text-body-sm text-ink-700">
                  {it.organizationName ?? (it.role === 'SUPER_ADMIN' ? '中心' : '—')}
                </span>
                {it.current && <Chip size="sm" tone="primary">現用</Chip>}
                {it.grantId ? (
                  <Button size="sm" variant="text" disabled={busy} onClick={() => void endGrant(it.grantId!)}>
                    收回
                  </Button>
                ) : (
                  <span className="text-caption text-ink-500">主要身分</span>
                )}
              </div>
            ))
          )}
        </div>

        <div className="flex flex-wrap items-end gap-3">
          <Select
            label="新增身分"
            value={addRole}
            onChange={(e) => setAddRole(e.target.value as 'ORG_ADMIN' | 'AUDITOR' | 'OBSERVER')}
          >
            <option value="OBSERVER">觀察員</option>
            <option value="AUDITOR">稽核委員</option>
            <option value="ORG_ADMIN">機關管理員</option>
          </Select>
          {addRole === 'ORG_ADMIN' && (
            <Select label="機關" value={addOrg} onChange={(e) => setAddOrg(e.target.value)}>
              <option value="">選擇機關…</option>
              {orgs.map((o) => (
                <option key={o.id} value={o.id}>{o.name}</option>
              ))}
            </Select>
          )}
          <Button size="sm" onClick={addGrant} loading={busy}>授予</Button>
        </div>
      </div>
    </Dialog>
  );
}
