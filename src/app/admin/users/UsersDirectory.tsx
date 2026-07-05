'use client';

import { useMemo, useState } from 'react';
import { Chip } from '@/components/ui/Chip';
import { EmptyState } from '@/components/ui/EmptyState';
import { TableScroll } from '@/components/ui/TableScroll';
import { Table, THead, Th, Tr, Td } from '@/components/ui/DataTable';
import { Segmented } from '@/components/ui/Segmented';
import { Select } from '@/components/ui/Select';
import { TextField } from '@/components/ui/TextField';
import { Users } from '@/components/icons';
import { ROLE_LABELS, ROLE_TONE, type Role } from '@/lib/types';
import { fmtROC, fmtROCDateTime } from '@/lib/date';
import UserRowActions from './UserRowActions';
import InviteRowActions from './InviteRowActions';

export type InviteRow = {
  id: string;
  name: string;
  email: string;
  role: Role;
  orgId: string | null;
  orgName: string | null;
  expiresAtISO: string;
  status: 'pending' | 'expired';
};
export type UserRow = {
  id: string;
  name: string;
  email: string;
  role: Role;
  orgId: string | null;
  orgName: string | null;
  isActive: boolean;
  lastLoginAtISO: string | null;
  disableReason: string | null;
  disabledByName: string | null;
  disabledAtISO: string | null;
  isSelf: boolean;
};

type StatusFilter = 'all' | 'pending' | 'expired' | 'active' | 'disabled';

/**
 * 使用者管理生命週期目錄:邀請(待接受/已過期)與帳號(啟用/停用)單一視圖,
 * 以狀態/角色/醫院/搜尋收斂 —— 過期邀請在此可見、可重寄(原版過期即從畫面消失)。
 */
export default function UsersDirectory({
  invites,
  users,
  orgs,
}: {
  invites: InviteRow[];
  users: UserRow[];
  orgs: { id: string; name: string }[];
}) {
  const [status, setStatus] = useState<StatusFilter>('all');
  const [roleFilter, setRoleFilter] = useState<'all' | Role>('all');
  const [orgFilter, setOrgFilter] = useState('all');
  const [q, setQ] = useState('');

  const counts = useMemo(() => ({
    pending: invites.filter((i) => i.status === 'pending').length,
    expired: invites.filter((i) => i.status === 'expired').length,
    active: users.filter((u) => u.isActive).length,
    disabled: users.filter((u) => !u.isActive).length,
  }), [invites, users]);

  const matchCommon = (r: { role: Role; orgId: string | null; name: string; email: string }) => {
    if (roleFilter !== 'all' && r.role !== roleFilter) return false;
    if (orgFilter !== 'all' && r.orgId !== orgFilter) return false;
    const needle = q.trim().toLowerCase();
    if (needle && !r.name.toLowerCase().includes(needle) && !r.email.toLowerCase().includes(needle)) return false;
    return true;
  };

  const shownInvites = invites.filter((i) => {
    if (status === 'active' || status === 'disabled') return false;
    if (status === 'pending' && i.status !== 'pending') return false;
    if (status === 'expired' && i.status !== 'expired') return false;
    return matchCommon(i);
  });
  const shownUsers = users.filter((u) => {
    if (status === 'pending' || status === 'expired') return false;
    if (status === 'active' && !u.isActive) return false;
    if (status === 'disabled' && u.isActive) return false;
    return matchCommon(u);
  });

  return (
    <div className="flex flex-col gap-4">
      {/* 工具列:生命週期狀態 / 角色 / 醫院 / 搜尋 */}
      <div className="flex flex-wrap items-end gap-3">
        <Segmented
          value={status}
          onChange={(v) => setStatus(v as StatusFilter)}
          options={[
            { value: 'all', label: '全部' },
            { value: 'pending', label: `待接受 ${counts.pending}` },
            { value: 'expired', label: `已過期 ${counts.expired}` },
            { value: 'active', label: `啟用中 ${counts.active}` },
            { value: 'disabled', label: `已停用 ${counts.disabled}` },
          ]}
        />
        <div className="w-40">
          <Select label="角色" value={roleFilter} onChange={(e) => setRoleFilter(e.target.value as 'all' | Role)}>
            <option value="all">全部角色</option>
            <option value="ORG_ADMIN">機關管理員</option>
            <option value="AUDITOR">稽核委員</option>
            <option value="SUPER_ADMIN">最高管理員</option>
          </Select>
        </div>
        <div className="w-52">
          <Select label="醫院" value={orgFilter} onChange={(e) => setOrgFilter(e.target.value)}>
            <option value="all">全部醫院</option>
            {orgs.map((o) => (
              <option key={o.id} value={o.id}>{o.name}</option>
            ))}
          </Select>
        </div>
        <div className="w-64 max-w-full">
          <TextField label="搜尋" placeholder="姓名或 email…" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
      </div>

      {/* 邀請(待接受/已過期):過期可重寄(效期展延 14 天)、待接受可撤銷 */}
      {shownInvites.length > 0 && (
        <div className="overflow-hidden rounded-md border border-rule bg-card">
          <div className="px-5 py-3 bg-paper-sunk text-ink-700 text-label-sm uppercase tracking-wide border-b border-rule-strong">
            邀請({shownInvites.length})
          </div>
          <TableScroll>
            <Table>
              <THead>
                <Th>姓名 / Email</Th>
                <Th>角色</Th>
                <Th>所屬醫院</Th>
                <Th>狀態</Th>
                <Th numeric>效期至</Th>
                <Th numeric>操作</Th>
              </THead>
              <tbody>
                {shownInvites.map((inv) => (
                  <Tr key={inv.id} hover={false}>
                    <Td>
                      <div className="font-medium text-ink-900">{inv.name}</div>
                      <div className="text-caption font-mono text-ink-500">{inv.email}</div>
                    </Td>
                    <Td>
                      <Chip size="sm" tone={ROLE_TONE[inv.role]}>{ROLE_LABELS[inv.role]}</Chip>
                    </Td>
                    <Td className="text-ink-500">{inv.orgName ?? '—'}</Td>
                    <Td>
                      {inv.status === 'pending'
                        ? <Chip size="sm" tone="warning" dot>待接受</Chip>
                        : <Chip size="sm" tone="neutral" dot>已過期</Chip>}
                    </Td>
                    <Td className="text-right text-caption text-ink-500 tabular-nums">
                      {fmtROC(inv.expiresAtISO)}
                    </Td>
                    <Td className="text-right">
                      <InviteRowActions inviteId={inv.id} email={inv.email} canRevoke={inv.status === 'pending'} />
                    </Td>
                  </Tr>
                ))}
              </tbody>
            </Table>
          </TableScroll>
        </div>
      )}

      {/* 帳號(啟用/停用) */}
      {shownUsers.length > 0 && (
        <div className="overflow-hidden rounded-md border border-rule bg-card">
          <TableScroll>
            <Table>
              <THead>
                <Th>姓名 / Email</Th>
                <Th>角色</Th>
                <Th>所屬醫院</Th>
                <Th>狀態</Th>
                <Th numeric>最後登入</Th>
                <Th numeric>操作</Th>
              </THead>
              <tbody>
                {shownUsers.map((u) => (
                  <Tr key={u.id}>
                    <Td>
                      <div className="font-medium text-ink-900">{u.name}</div>
                      <div className="text-caption font-mono text-ink-500">{u.email}</div>
                    </Td>
                    <Td>
                      <Chip size="sm" tone={ROLE_TONE[u.role]}>{ROLE_LABELS[u.role]}</Chip>
                    </Td>
                    <Td className="text-ink-500">{u.orgName ?? '—'}</Td>
                    <Td>
                      {u.isActive ? (
                        <Chip size="sm" tone="success">啟用</Chip>
                      ) : (
                        <div className="space-y-1">
                          <Chip size="sm" tone="neutral">停用</Chip>
                          {u.disableReason && (
                            <p className="text-caption text-ink-500 max-w-[16rem] leading-snug">
                              {u.disableReason}
                              {u.disabledByName && (
                                <span className="block text-ink-500">
                                  — {u.disabledByName}{u.disabledAtISO ? ` · ${fmtROC(u.disabledAtISO)}` : ''}
                                </span>
                              )}
                            </p>
                          )}
                        </div>
                      )}
                    </Td>
                    <Td className="text-right text-caption text-ink-500 tabular-nums">
                      {u.lastLoginAtISO ? fmtROCDateTime(u.lastLoginAtISO) : '尚未登入'}
                    </Td>
                    <Td className="text-right">
                      <UserRowActions
                        userId={u.id}
                        name={u.name}
                        role={u.role}
                        isActive={u.isActive}
                        hasOrganization={!!u.orgId}
                        isSelf={u.isSelf}
                      />
                    </Td>
                  </Tr>
                ))}
              </tbody>
            </Table>
          </TableScroll>
        </div>
      )}

      {shownInvites.length === 0 && shownUsers.length === 0 && (
        <div className="rounded-md border border-rule bg-card">
          <EmptyState
            icon={<Users size={28} />}
            title="沒有符合條件的人員"
            description="調整上方篩選或搜尋條件;或用右上角「邀請人員」建立邀請。"
          />
        </div>
      )}
    </div>
  );
}
