'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';
import {
  LayoutDashboard,
  ClipboardCheck,
  AlertTriangle,
  Users,
  History,
  Settings,
} from '../icons';
import type { Role } from '@/lib/types';
import { Wordmark } from '../brand/Logo';

type Item = {
  href: string;
  label: string;
  icon: ReactNode;
  allow: Role[];
};

type Group = {
  label?: string;
  items: Item[];
};

const groups: Group[] = [
  {
    items: [
      { href: '/', label: '總覽', icon: <LayoutDashboard size={17} />, allow: ['ADMIN', 'AUDITOR', 'RESPONDENT', 'SUPERVISOR'] },
    ],
  },
  {
    label: '稽核作業',
    items: [
      { href: '/cycles', label: '稽核週期', icon: <ClipboardCheck size={17} />, allow: ['ADMIN', 'AUDITOR', 'RESPONDENT', 'SUPERVISOR'] },
      { href: '/findings-overview', label: '稽核發現', icon: <AlertTriangle size={17} />, allow: ['ADMIN', 'AUDITOR'] },
    ],
  },
  {
    label: '管理',
    items: [
      { href: '/admin/users', label: '使用者', icon: <Users size={17} />, allow: ['ADMIN'] },
      { href: '/admin/audit-log', label: '審計軌跡', icon: <History size={17} />, allow: ['ADMIN', 'AUDITOR'] },
      { href: '/admin/settings', label: '設定', icon: <Settings size={17} />, allow: ['ADMIN'] },
    ],
  },
];

const roleAccent: Record<Role, string> = {
  ADMIN: 'bg-primary-400',
  AUDITOR: 'bg-sage-400',
  RESPONDENT: 'bg-neutral-300',
  SUPERVISOR: 'bg-warning-400',
};

export function Sidebar({
  role,
  collapsed,
  onClose,
  showBrand = true,
}: {
  role: Role;
  collapsed?: boolean;
  onClose?: () => void;
  showBrand?: boolean;
}) {
  const pathname = usePathname();

  return (
    <aside
      className={cn(
        'relative flex flex-col bg-surface-muted border-r border-hairline transition-all duration-180 ease-smooth',
        collapsed ? 'w-16' : 'w-64',
      )}
    >
      {/* Role accent strip — subtle */}
      <span className={cn('absolute left-0 top-0 h-full w-[3px] opacity-70', roleAccent[role])} aria-hidden />

      {showBrand && !collapsed && (
        <div className="h-14 flex items-center px-5 border-b border-hairline">
          <Wordmark />
        </div>
      )}

      <nav className="flex-1 overflow-y-auto scrollbar-thin py-5">
        {groups.map((g, gi) => {
          const items = g.items.filter((i) => i.allow.includes(role));
          if (items.length === 0) return null;
          return (
            <div key={gi} className="mb-6 last:mb-0">
              {g.label && !collapsed && (
                <div className="px-5 mb-2 text-[0.6875rem] uppercase tracking-[0.1em] text-neutral-400 font-medium">
                  {g.label}
                </div>
              )}
              <ul className="flex flex-col gap-0.5 px-2">
                {items.map((i) => {
                  const active =
                    pathname === i.href ||
                    (i.href !== '/' && pathname.startsWith(i.href));
                  return (
                    <li key={i.href}>
                      <Link
                        href={i.href}
                        onClick={onClose}
                        className={cn(
                          'group relative flex items-center gap-2.5 rounded-md px-3 h-9 text-body-sm transition-colors duration-180 ease-smooth focus-ring',
                          active
                            ? 'text-primary-700 font-medium'
                            : 'text-neutral-600 hover:bg-white hover:text-neutral-900',
                          collapsed && 'justify-center px-0',
                        )}
                        title={collapsed ? i.label : undefined}
                      >
                        {active && (
                          <span
                            className="absolute left-0 top-2 bottom-2 w-[2px] bg-primary-600 rounded-full"
                            aria-hidden
                          />
                        )}
                        <span
                          className={cn(
                            'transition-colors',
                            active ? 'text-primary-600' : 'text-neutral-400 group-hover:text-neutral-700',
                          )}
                        >
                          {i.icon}
                        </span>
                        {!collapsed && <span>{i.label}</span>}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          );
        })}
      </nav>

      {!collapsed && (
        <div className="px-5 py-4 border-t border-hairline text-caption text-neutral-400">
          <span className="font-medium text-neutral-500">MOECISH</span> · v0.3
        </div>
      )}
    </aside>
  );
}
