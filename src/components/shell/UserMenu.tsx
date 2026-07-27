'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { signOut } from 'next-auth/react';
import { cn } from '@/lib/cn';
import { Chip } from '../ui/Chip';
import { ChevronDown, LogOut, User, Users } from '../icons';
import { ROLE_LABELS, ROLE_TONE, type Role } from '@/lib/types';
import { ROLE_SURFACE } from '@/lib/tone';

// 多重身分(批31/方案A):開選單時懶載本帳號可用身分;>1 個才顯示「切換身分」段。
// 切換成功後整頁導回 /dashboard(full reload)——session 於下一請求由 jwt 回查同步,
// 且各頁面/客端元件持有的角色態一併重建,避免半新半舊。
type IdentityDTO = { role: Role; organizationId: string | null; organizationName: string | null; current: boolean };

// 頭像底色由 lib/tone 的 ROLE_SURFACE 單一來源提供(批72:消除第二份角色配色,與 TopStrip 頂帶／角色 Chip 共用 ROLE_TONE)
const avatarBg = ROLE_SURFACE;

export function UserMenu({
  name,
  role,
  organizationName,
  email,
}: {
  name: string;
  role: Role;
  organizationName: string | null;
  email: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const [identities, setIdentities] = useState<IdentityDTO[] | null>(null);
  const [switching, setSwitching] = useState(false);

  useEffect(() => {
    if (!open || identities !== null) return;
    let cancelled = false;
    fetch('/api/identity')
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => { if (!cancelled && j) setIdentities(j.identities ?? []); })
      .catch(() => { if (!cancelled) setIdentities([]); });
    return () => { cancelled = true; };
  }, [open, identities]);

  async function switchIdentity(target: IdentityDTO) {
    if (target.current || switching) return;
    setSwitching(true);
    try {
      const res = await fetch('/api/identity', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ role: target.role, organizationId: target.organizationId }),
      });
      if (res.ok) {
        // 清除側欄週期快取:兩個 ORG_ADMIN 身分的 nav 快取鍵僅含 role 會相撞,切換後殘留他機關院名
        // (批31 對抗審查 P2);sessionStorage 跨 reload 存活,故切換前主動清 moecish.nav.*。
        try {
          for (let i = sessionStorage.length - 1; i >= 0; i--) {
            const k = sessionStorage.key(i);
            if (k && k.startsWith('moecish.nav.')) sessionStorage.removeItem(k);
          }
        } catch { /* ignore */ }
        window.location.assign('/dashboard');
        return;
      }
    } catch { /* 落到重置 */ }
    setSwitching(false);
  }

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const initials = name.slice(0, 1);

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 h-10 pl-1 pr-2 rounded-full hover:bg-paper-sunk focus-ring transition-colors duration-200"
        aria-label="使用者選單"
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <span
          className={cn(
            'w-9 h-9 rounded-full flex items-center justify-center text-body-sm font-medium',
            avatarBg[role],
          )}
          aria-hidden
        >
          {initials}
        </span>
        <span className="hidden md:flex flex-col items-start leading-tight">
          <span className="text-body-sm text-ink-900">{name}</span>
          <span className="text-caption text-ink-500">{ROLE_LABELS[role]}</span>
        </span>
        <ChevronDown size={16} className="text-ink-500 hidden md:block" />
      </button>

      {open && (
        <div
          role="menu"
          // P2:多重身分帳號展開切換清單後可達 380px+,父層 sticky 頂帶使矮視窗捲不到 → 自身可捲
          className="absolute right-0 top-full mt-2 w-72 max-h-[calc(100dvh-5rem)] overflow-y-auto bg-paper-sunk rounded-md shadow-elev-3 animate-fade-in z-40"
        >
          <div className="p-5 border-b border-rule">
            <div className="flex items-center gap-3">
              <div
                className={cn(
                  'w-12 h-12 rounded-full flex items-center justify-center text-title-md font-medium',
                  avatarBg[role],
                )}
              >
                {initials}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-body font-medium text-ink-900 truncate">{name}</p>
                <p className="text-caption text-ink-500 truncate">{email}</p>
              </div>
            </div>
            <div className="mt-3 flex items-center gap-1.5">
              <Chip tone={ROLE_TONE[role]} size="sm">{ROLE_LABELS[role]}</Chip>
              {organizationName && (
                <span className="text-caption text-ink-500 truncate">{organizationName}</span>
              )}
            </div>
          </div>
          {identities !== null && identities.length > 1 && (
            <div className="py-2 border-b border-rule">
              <p className="px-5 pt-1 pb-1.5 text-label-sm font-medium uppercase tracking-[0.08em] text-ink-500 flex items-center gap-1.5">
                <Users size={14} /> 切換身分
              </p>
              {identities.map((it) => (
                <button
                  key={`${it.role}:${it.organizationId ?? ''}`}
                  role="menuitem"
                  disabled={it.current || switching}
                  onClick={() => void switchIdentity(it)}
                  className={cn(
                    'w-full flex items-center gap-3 px-5 h-11 text-body-sm transition-colors',
                    it.current ? 'text-ink-500 cursor-default bg-card/60' : 'text-ink-900 hover:bg-card',
                  )}
                >
                  <Chip tone={ROLE_TONE[it.role]} size="sm">{ROLE_LABELS[it.role]}</Chip>
                  <span className="min-w-0 flex-1 truncate text-left">
                    {it.organizationName ?? (it.role === 'SUPER_ADMIN' ? '中心' : '')}
                  </span>
                  {it.current && <span className="text-caption text-ink-500 shrink-0">目前</span>}
                </button>
              ))}
            </div>
          )}
          <div className="py-2">
            <Link
              href="/account"
              role="menuitem"
              onClick={() => setOpen(false)}
              className="w-full flex items-center gap-3 px-5 h-12 text-body-sm text-ink-900 hover:bg-card transition-colors"
            >
              <User size={18} className="text-ink-500" />
              <span>個人資料</span>
            </Link>
            <button
              role="menuitem"
              onClick={() => signOut({ callbackUrl: '/login' })}
              className="w-full flex items-center gap-3 px-5 h-12 text-body-sm text-ink-900 hover:bg-card transition-colors"
            >
              <LogOut size={18} className="text-ink-500" />
              <span>登出</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
