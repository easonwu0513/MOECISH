'use client';

import { useEffect, useRef, useState } from 'react';
import { signOut } from 'next-auth/react';
import { cn } from '@/lib/cn';
import { Chip } from '../ui/Chip';
import { ChevronDown, LogOut, User } from '../icons';
import type { Role } from '@/lib/types';

const roleLabel: Record<Role, string> = {
  ADMIN: '平台管理員',
  AUDITOR: '稽核委員',
  RESPONDENT: '填報人',
  SUPERVISOR: '單位主管',
};

const roleTone: Record<Role, 'primary' | 'sage' | 'neutral' | 'warning'> = {
  ADMIN: 'primary',
  AUDITOR: 'sage',
  RESPONDENT: 'neutral',
  SUPERVISOR: 'warning',
};

const avatarBg: Record<Role, string> = {
  ADMIN: 'bg-primary-container text-on-primary-container',
  AUDITOR: 'bg-sage-100 text-sage-800',
  RESPONDENT: 'bg-surface-container-highest text-on-surface',
  SUPERVISOR: 'bg-warning-100 text-warning-700',
};

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

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [open]);

  const initials = name.slice(0, 1);

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 h-10 pl-1 pr-2 rounded-full hover:bg-surface-container focus-ring transition-colors duration-200"
        aria-label="使用者選單"
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
          <span className="text-body-sm text-on-surface">{name}</span>
          <span className="text-caption text-on-surface-variant">{roleLabel[role]}</span>
        </span>
        <ChevronDown size={16} className="text-on-surface-variant hidden md:block" />
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 top-full mt-2 w-72 bg-surface-container-high rounded-md shadow-elev-3 overflow-hidden animate-fade-in z-40"
        >
          <div className="p-5 border-b border-outline-variant">
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
                <p className="text-body font-medium text-on-surface truncate">{name}</p>
                <p className="text-caption text-on-surface-variant truncate">{email}</p>
              </div>
            </div>
            <div className="mt-3 flex items-center gap-1.5">
              <Chip tone={roleTone[role]} size="sm">{roleLabel[role]}</Chip>
              {organizationName && (
                <span className="text-caption text-on-surface-variant truncate">{organizationName}</span>
              )}
            </div>
          </div>
          <div className="py-2">
            <button
              role="menuitem"
              className="w-full flex items-center gap-3 px-5 h-12 text-body-sm text-on-surface hover:bg-surface-container transition-colors"
            >
              <User size={18} className="text-on-surface-variant" />
              <span>個人資料</span>
            </button>
            <button
              role="menuitem"
              onClick={() => signOut({ callbackUrl: '/login' })}
              className="w-full flex items-center gap-3 px-5 h-12 text-body-sm text-on-surface hover:bg-surface-container transition-colors"
            >
              <LogOut size={18} className="text-on-surface-variant" />
              <span>登出</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
