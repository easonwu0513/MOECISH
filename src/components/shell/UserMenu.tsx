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

const roleBorder: Record<Role, string> = {
  ADMIN: 'ring-primary-300',
  AUDITOR: 'ring-sage-300',
  RESPONDENT: 'ring-neutral-300',
  SUPERVISOR: 'ring-warning-300',
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
        className="flex items-center gap-2 h-9 pl-1.5 pr-2 rounded-lg hover:bg-neutral-100 focus-ring"
        aria-label="使用者選單"
        aria-expanded={open}
      >
        <span
          className={cn(
            'w-7 h-7 rounded-full bg-primary-600 text-white flex items-center justify-center text-body-sm font-semibold ring-2',
            roleBorder[role],
          )}
          aria-hidden
        >
          {initials}
        </span>
        <span className="hidden md:flex flex-col items-start leading-tight">
          <span className="text-body-sm text-neutral-900">{name}</span>
          <span className="text-caption text-neutral-500">{roleLabel[role]}</span>
        </span>
        <ChevronDown size={14} className="text-neutral-400" />
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 top-full mt-1.5 w-64 bg-white rounded-xl shadow-lg border border-neutral-200 overflow-hidden animate-fade-in z-40"
        >
          <div className="p-4 border-b border-neutral-100">
            <div className="flex items-center gap-3">
              <div
                className={cn(
                  'w-10 h-10 rounded-full bg-primary-600 text-white flex items-center justify-center text-body font-semibold ring-2',
                  roleBorder[role],
                )}
              >
                {initials}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-body-sm font-semibold text-neutral-900 truncate">{name}</p>
                <p className="text-caption text-neutral-500 truncate">{email}</p>
              </div>
            </div>
            <div className="mt-3 flex items-center gap-1.5">
              <Chip tone={roleTone[role]} size="sm">{roleLabel[role]}</Chip>
              {organizationName && (
                <span className="text-caption text-neutral-500 truncate">{organizationName}</span>
              )}
            </div>
          </div>
          <div className="py-1">
            <button
              role="menuitem"
              className="w-full flex items-center gap-3 px-4 py-2 text-body-sm text-neutral-700 hover:bg-neutral-50"
            >
              <User size={16} className="text-neutral-400" />
              <span>個人資料</span>
            </button>
            <button
              role="menuitem"
              onClick={() => signOut({ callbackUrl: '/login' })}
              className="w-full flex items-center gap-3 px-4 py-2 text-body-sm text-neutral-700 hover:bg-neutral-50"
            >
              <LogOut size={16} className="text-neutral-400" />
              <span>登出</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
